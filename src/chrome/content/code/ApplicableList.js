// An ApplicableList is a structure used to keep track of which rulesets
// were applied, and which ones weren't but might have been, to the contents
// of a given page (top level nsIDOMWindow)

serial_number = 0

function ApplicableList(logger, doc, domWin) {
  this.domWin = domWin;
  this.home = doc.baseURIObject.spec; // what doc we're housekeeping for
  this.doc = doc;
  this.log = logger;
  this.active = {};
  this.breaking = {}; // rulesets with redirection loops
  this.inactive = {};
  this.moot={};  // rulesets that might be applicable but uris are already https
  this.all={};  // active + breaking + inactive + moot
  serial_number += 1;
  this.serial = serial_number;
  this.log(NOTE,"Alist serial #" + this.serial + " for " + this.home);
};

ApplicableList.prototype = {

  empty: function() {
    // Empty everything, used when toggles occur in order to ensure that if
    // the reload fails, the resulting list is not eroneous
    this.active = {};
    this.breaking = {}; 
    this.inactive = {};
    this.moot={};  
    this.all={};  
  },

  active_rule: function(ruleset) {
    this.log(INFO,"active rule " + ruleset.name +" in "+ this.home +" -> " +
             this.domWin.document.baseURIObject.spec+ " serial " + this.serial);
    this.active[ruleset.name] = ruleset;
    this.all[ruleset.name] = ruleset;
  },

  breaking_rule: function(ruleset) {
    this.log(NOTE,"breaking rule " + ruleset.name +" in "+ this.home +" -> " +
             this.domWin.document.baseURIObject.spec+ " serial " + this.serial);
    this.breaking[ruleset.name] = ruleset;
    this.all[ruleset.name] = ruleset;
  },

  inactive_rule: function(ruleset) {

    this.log(INFO,"inactive rule " + ruleset.name +" in "+ this.home +" -> " +
             this.domWin.document.baseURIObject.spec+ " serial " + this.serial);
    this.inactive[ruleset.name] = ruleset;
    this.all[ruleset.name] = ruleset;
  },

  moot_rule: function(ruleset) {
    this.log(INFO,"moot rule " + ruleset.name +" in "+ this.home + " serial " + this.serial);
    this.moot[ruleset.name] = ruleset;
    this.all[ruleset.name] = ruleset;
  },

  dom_handler: function(operation,key,data,src,dst) {
    // See https://developer.mozilla.org/En/DOM/UserDataHandler
    if (src && dst) 
      dst.setUserData(key, data, this.dom_handler);
  },

  populate_menu: function(document, menupopup, weird) {

    // The base URI of the dom tends to be loaded from some /other/
    // ApplicableList, so pretend we're loading it from here.
    HTTPSEverywhere.instance.https_rules.rewrittenURI(this, this.doc.baseURIObject);
    this.log(DBUG, "populating using alist #" + this.serial);
    this.document = document;
   
    // get the menu popup
    this.menupopup = menupopup;

    // empty it all of its menuitems
    while(this.menupopup.firstChild.tagName != "menuseparator") {
      this.menupopup.removeChild(this.menupopup.firstChild);
    }

    // add the label at the top
    var any_rules = false
    for (var x in this.all) {
      any_rules = true;  // how did JavaScript get this ugly?
      break;
    }
    var label = document.createElement('menuitem');
    if (any_rules) {
        label.setAttribute('label', 'Enable / Disable Rules');
    } else {
      if (!weird) label.setAttribute('label', '(No Rules for This Page)');
      else        label.setAttribute('label', '(Rules for This Page Uknown)');
    }
    label.setAttribute('command', 'https-everywhere-menuitem-preferences');

    // create a commandset if it doesn't already exist
    this.commandset = document.getElementById('https-everywhere-commandset');
    if(!this.commandset) {
      this.commandset = document.createElement('commandset');
      this.commandset.setAttribute('id', 'https-everywhere-commandset');
      var win = document.getElementById('main-window');
      win.appendChild(this.commandset);
    } else {
      // empty commandset
      while(this.commandset.firstChild) 
        this.commandset.removeChild(this.commandset.firstChild);
    }

	var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
					 
	var domWin = wm.getMostRecentWindow("navigator:browser").content.document.defaultView.top;	
	var location = domWin.document.baseURIObject.asciiSpec; //full url, including about:certerror details
	
	if(location.substr(0, 15) == "about:certerror"){
		//"From" portion of the rule is retrieved from the location bar via document.getElementById("urlbar").value
		  
		var fromHost = document.getElementById("urlbar").value;	 
		
	    //scheme must be trimmed out to check for applicable rulesets		
		if(fromHost.indexOf("://") != -1)
			fromHost = fromHost.substr(fromHost.indexOf("://") + 3, fromHost.length);
			
		//trim off any page locations - we only want the host - e.g. domain.com
		if(fromHost.indexOf("/") != -1)
			fromHost = fromHost.substr(0, fromHost.indexOf("/"));
					   
		//Search for applicable rulesets for the host listed in the location bar
		var alist = HTTPSRules.potentiallyApplicableRulesets(fromHost);		
	  
		https_everywhere = CC["@eff.org/https-everywhere;1"].getService(Components.interfaces.nsISupports).wrappedJSObject;
		o_httpsprefs = https_everywhere.get_prefs();
		
		for (var i = 0 ; i < alist.length ; i++){
			//For each applicable rulset, determine active/inactive, and append to proper list.
			if(o_httpsprefs.getBoolPref(alist[i].name))
				this.active_rule(alist[i]);
			else
				this.inactive_rule(alist[i]);					
		}	
	}	
	
    // add all applicable commands
    for(var x in this.breaking) 
      this.add_command(this.breaking[x]); 
    for(var x in this.active) 
      this.add_command(this.active[x]); 
    for(var x in this.moot)
      this.add_command(this.moot[x]);
    for(var x in this.inactive) 
      this.add_command(this.inactive[x]);

    // add all the menu items
    for (var x in this.inactive)
      this.add_menuitem(this.inactive[x], 'inactive');
    // rules that are active for some uris are not really moot
    for (var x in this.moot) 
      if (!(x in this.active))   
        this.add_menuitem(this.moot[x], 'moot');
    // break once break everywhere
    for (var x in this.active) 
      if (!(x in this.breaking))
        this.add_menuitem(this.active[x], 'active');
    for (var x in this.breaking)
      this.add_menuitem(this.breaking[x], 'breaking');
    
    this.prepend_child(label);
  },

  prepend_child: function(node) {
    this.menupopup.insertBefore(node, this.menupopup.firstChild);
  },

  add_command: function(rule) {
      var command = this.document.createElement("command");
      command.setAttribute('id', rule.id+'-command');
      command.setAttribute('label', rule.name);
      command.setAttribute('oncommand', 'toggle_rule("'+rule.id+'")');
      this.commandset.appendChild(command);
  },

  // add a menu item for a rule -- type is "active", "inactive", "moot",
  // or "breaking"

  add_menuitem: function(rule, type) {
    // create the menuitem
    var item = this.document.createElement('menuitem');
    item.setAttribute('command', rule.id+'-command');
    item.setAttribute('class', type+'-item');

    // set the icon
    var image = this.document.createElement('image');
    var image_src;
    if (type == 'active') image_src = 'tick.png';
    else if (type == 'inactive') image_src = 'cross.png';
    else if (type == 'moot') image_src = 'tick-moot.png';
    else if (type == 'breaking') image_src = 'tick-red.png';
    image.setAttribute('src', 'chrome://https-everywhere/skin/'+image_src);

    // set the label
    var label = this.document.createElement('label');
    label.setAttribute('value', "   " + rule.name);
    
    // put them in an hbox, and put the hbox in the menuitem
    var hbox = this.document.createElement('hbox');
    hbox.appendChild(image);
    hbox.appendChild(label);
    item.appendChild(hbox);

    // all done
    this.prepend_child(item);
  },

  show_applicable: function() {
    this.log(WARN, "Applicable list number " + this.serial);
    for (var x in this.active) 
      this.log(WARN,"Active: " + this.active[x].name);

    for (var x in this.breaking) 
      this.log(WARN,"Breaking: " + this.breaking[x].name);
  
    for (x in this.inactive) 
      this.log(WARN,"Inactive: " + this.inactive[x].name);

    for (x in this.moot) 
      this.log(WARN,"Moot: " + this.moot[x].name);
    
  }
};

