// Page loaded
$(function() {

	// ** Application container ** //
	window.SP = {}

	// Global state
	SP.state = {};
	SP.agentsRef = {};
	SP.callsRef = {};
	SP.agent = {};
	SP.state.callNumber = null;
	SP.state.calltype = "";
	SP.username = $('#client_name').text();
	SP.currentCall = null;	//instance variable for tracking current connection
	SP.requestedHold = false; //set if agent requested hold button



	SP.functions = {};

	// Get a Twilio Client name and register with Twilio
	SP.functions.getTwilioClientName = function(sfdcResponse) {
		sforce.interaction.runApex('UserInfo', 'getUserName', '' , SP.functions.registerTwilioClient);
	}

	SP.functions.registerTwilioClient = function(response) {

		console.log("Registering with client name: " + response.result);

		// Twilio does not accept special characters in Client names
		var useresult = response.result;
		useresult = useresult.replace("@", "AT");
		useresult = useresult.replace(".", "DOT");
		SP.username = useresult;
		console.log("useresult = " + useresult);

		$.get("/getconfig", {"client":SP.username}, function (data) {
			if( typeof data.api_key !== 'undefined' ){
				// agents...
				SP.agentsRef = new Flybase( data.api_key, data.app_name, 'agents');
				SP.agentsRef.isReady( function(){
					SP.functions.startWebSocket();
				});
				// calls...
				SP.callsRef = new Flybase( data.api_key, data.app_name, 'calls');
			}else{
				console.log( "umm yeah, something's broken. Please fix it");
			}
		});

		$.get("/token", {"client":SP.username}, function (token) {
			Twilio.Device.setup(token, {debug: true});
		});

		$.get("/getcallerid", { "from":SP.username}, function(data) {
			$("#callerid-entry > input").val(data);
		});

	}


	SP.functions.startWebSocket = function() {
		// ** Agent Presence Stuff ** //
		console.log(".startWebSocket...");
		var d = new Date();
		var date = d.toLocaleString();

//		look up or add agent:
		SP.functions.update_agent(SP.username,{
			status: 'LoggingIn',
			readytime: date
		});	
		SP.agentsRef.on('agents-ready', function (data) {
			$("#team-status .agents-num").text( data ); 
		});
		SP.agentsRef.on('in-queue', function (data) {
			$("#team-status .queues-num").text( data);
		});

//		$(window).bind("beforeunload", function() { 
		SP.agentsRef.onDisconnect( function(){
			// if agent gets disconnected for any reason, then we want to kick them offline...
			SP.agentsRef.trigger('agent-removed',{username: SP.username});
		});
	}

//	update or insert agent.. don't keep re-adding same agent..
	SP.functions.update_agent = function(client, data){
		var d = new Date();
		var date = d.toLocaleString();
		SP.agentsRef.where({"client": client}).on('value',function( rec ){
			if( rec.count() !== null ){
				var agent = rec.first().value();
				for( var i in data ){
					agent[i] = data[i];
				}
				SP.agent = agent;
				SP.agentsRef.push(agent, function(resp) {
					console.log( "agent updated" );
				});				
			}else{
				data.client = client;
				SP.agent = data;
				SP.agentsRef.push(data, function(resp) {
					console.log( "agent inserted" );
				});				
			}
		});
	}

	// ** UI Widgets ** //

	// Hook up numpad to input field
	$("div.number").bind('click',function(){
		//$("#number-entry > input").val($("#number-entry > input").val()+$(this).attr('Value'));
		//pass key without conn to a function
		SP.functions.handleKeyEntry($(this).attr('Value'));	

	});

	SP.functions.handleKeyEntry = function (key) {	
		 if (SP.currentCall != null) {
			console.log("sending DTMF" + key);
			SP.currentCall.sendDigits(key);
		 } else {
			 $("#number-entry > input").val($("#number-entry > input").val()+key);
		 }

	}

	//called when agent is not on a call
	SP.functions.setIdleState = function() {
		$("#action-buttons > .call").show();
		$("#action-buttons > .answer").hide();
		$("#action-buttons > .mute").hide();
		$("#action-buttons > .hold").hide();
		$("#action-buttons > .unhold").hide();
		$("#action-buttons > .hangup").hide();
		$('div.agent-status').hide();
		$("#number-entry > input").val("");
	}

	SP.functions.setRingState = function () {
		$("#action-buttons > .answer").show();
		$("#action-buttons > .call").hide();
		$("#action-buttons > .mute").hide();
		$("#action-buttons > .hold").hide();
		$("#action-buttons > .unhold").hide();
		$("#action-buttons > .hangup").hide();
	}

	SP.functions.setOnCallState = function() {

		$("#action-buttons > .answer").hide();
		$("#action-buttons > .call").hide();
		$("#action-buttons > .mute").show();

		//can not hold outbound calls, so disable this
		if (SP.calltype == "Inbound") {
			$("#action-buttons > .hold").show();
		}

		$("#action-buttons > .hangup").show();
		$('div.agent-status').show();
	}

	// Hide caller info
	SP.functions.hideCallData = function() {
		$("#call-data").hide();
	}
	SP.functions.hideCallData();
	SP.functions.setIdleState();

	// Show caller info
	SP.functions.showCallData = function(callData) {
		$("#call-data > ul").hide();
		$(".caller-name").text(callData.callerName);
		$(".caller-number").text(callData.callerNumber);
		$(".caller-queue").text(callData.callerQueue);
		$(".caller-message").text(callData.callerMessage);

		if (callData.callerName) {
			$("#call-data > ul.name").show();
		}

		if (callData.callerNumber) {
			$("#call-data > ul.phone_number").show();
		}

		if (callData.callerQueue) {
			$("#call-data > ul.queue").show();
		}

		if (callData.callerMessage) {
			$("#call-data > ul.message").show();
		}

		$("#call-data").slideDown(400);
	}

	// Attach answer button to an incoming connection object
	SP.functions.attachAnswerButton = function(conn) {
		$("#action-buttons > button.answer").click(function() {
		conn.accept();
		}).removeClass('inactive').addClass("active");
	}

	SP.functions.detachAnswerButton = function() {
		$("#action-buttons > button.answer").unbind().removeClass('active').addClass("inactive");
	}

	SP.functions.attachMuteButton = function(conn) {
		$("#action-buttons > button.mute").click(function() {
		conn.mute();
		SP.functions.attachUnMute(conn);
		}).removeClass('inactive').addClass("active").text("Mute");
	}

	SP.functions.attachUnMute = function(conn) {
		$("#action-buttons > button.mute").click(function() {
		conn.unmute();
		SP.functions.attachMuteButton(conn);
		}).removeClass('inactive').addClass("active").text("UnMute");
	}

	SP.functions.detachMuteButton = function() {
		$("#action-buttons > button.mute").unbind().removeClass('active').addClass("inactive");
	}

	SP.functions.attachHoldButton = function(conn) {
		$("#action-buttons > button.hold").click(function() {
		 console.dir(conn);
		 SP.requestedHold = true;
		 //can't hold outbound calls from Twilio client
		 $.post("/request_hold", { "from":SP.username, "callsid":conn.parameters.CallSid, "calltype":SP.calltype }, function(data) {
			 //Todo: handle errors
			 //Todo: change status in future
			 SP.functions.attachUnHold(conn, data);

			});

		}).removeClass('inactive').addClass("active").text("Hold");
	}

	SP.functions.attachUnHold = function(conn, holdid) {
		$("#action-buttons > button.unhold").click(function() {
		//do ajax request to hold for the conn.id
		 
		 $.post("/request_unhold", { "from":SP.username, "callsid":holdid }, function(data) {
			 //Todo: handle errors
			 //Todo: change status in future
			 //SP.functions.attachHoldButton(conn);
			});
		
		}).removeClass('inactive').addClass("active").text("UnHold").show();
	}

	SP.functions.detachHoldButtons = function() {
		$("#action-buttons > button.unhold").unbind().removeClass('active').addClass("inactive");
		$("#action-buttons > button.hold").unbind().removeClass('active').addClass("inactive");
	}




	SP.functions.updateAgentStatusText = function(statusCategory, statusText, inboundCall) {

		if (statusCategory == "ready") {
			 $("#agent-status-controls > button.ready").prop("disabled",true); 
			 $("#agent-status-controls > button.not-ready").prop("disabled",false); 
			 $("#agent-status").removeClass();
			 $("#agent-status").addClass("ready");
			 $('#softphone').removeClass('incoming');

		 }

		if (statusCategory == "notReady") {
			 $("#agent-status-controls > button.ready").prop("disabled",false); 
			 $("#agent-status-controls > button.not-ready").prop("disabled",true); 
			 $("#agent-status").removeClass();
			 $("#agent-status").addClass("not-ready");
			 $('#softphone').removeClass('incoming');

		}

		if (statusCategory == "onCall") {
			$("#agent-status-controls > button.ready").prop("disabled",true); 
			$("#agent-status-controls > button.not-ready").prop("disabled",true); 
			$("#agent-status").removeClass();
			$("#agent-status").addClass("on-call");
			$('#softphone').removeClass('incoming');
		}

		if (inboundCall ==	true) { 
		//alert("call from " + statusText);
		$('#softphone').addClass('incoming');
		$("#number-entry > input").val(statusText);
		}

		//$("#agent-status > p").text(statusText);
	}

	// Call button will make an outbound call (click to dial) to the number entered 
	$("#action-buttons > button.call").click( function( ) {
		params = {"PhoneNumber": $("#number-entry > input").val(), "CallerId": $("#callerid-entry > input").val()};
		Twilio.Device.connect(params);
	});

	// Hang up button will hang up any active calls
	$("#action-buttons > button.hangup").click( function( ) {
		Twilio.Device.disconnectAll();
	});

	// Wire the ready / not ready buttons up to the server-side status change functions
	$("#agent-status-controls > button.ready").click( function( ) {
		$("#agent-status-controls > button.ready").prop("disabled",true); 
		$("#agent-status-controls > button.not-ready").prop("disabled",false); 
		SP.functions.ready();
	});

	$("#agent-status-controls > button.not-ready").click( function( ) {
		$("#agent-status-controls > button.ready").prop("disabled",false); 
		$("#agent-status-controls > button.not-ready").prop("disabled",true); 
		SP.functions.notReady();
	});

	$("#agent-status-controls > button.userinfo").click( function( ) {


	});



	// ** Twilio Client Stuff ** //
	// first register outside of sfdc


	if ( window.self === window.top ) {	
		console.log("Not in an iframe, assume we are using default client");
		var defaultclient = {}
		defaultclient.result = SP.username;
		SP.functions.registerTwilioClient(defaultclient);
	} else{
		console.log("In an iframe, assume it is Salesforce");
		sforce.interaction.isInConsole(SP.functions.getTwilioClientName);	 
	}
	//this will only be called inside of salesforce

	Twilio.Device.ready(function (device) {
		sforce.interaction.cti.enableClickToDial();
		sforce.interaction.cti.onClickToDial(startCall); 
		var adNag = function() {
			SP.functions.ready();
		};
		setTimeout(adNag, 1500);
	});

	Twilio.Device.offline(function (device) {
		//make a new status call.. something like.. disconnected instead of notReady ?
		sforce.interaction.cti.disableClickToDial(); 
		SP.functions.notReady();
		SP.functions.hideCallData();
	});


	/* Report any errors on the screen */
	Twilio.Device.error(function (error) {
		SP.functions.updateAgentStatusText("ready", error.message);
		SP.functions.hideCallData();
	});

	/* Log a message when a call disconnects. */
	Twilio.Device.disconnect(function (conn) {
		console.log("disconnectiong...");
		SP.functions.updateAgentStatusText("ready", "Call ended");

		
		
		SP.state.callNumber = null;
		
		// deactivate answer button
		SP.functions.detachAnswerButton();
		SP.functions.detachMuteButton();
		SP.functions.detachHoldButtons();
		SP.functions.setIdleState(); 
		
		SP.currentCall = null;
		
		// return to waiting state
		SP.functions.hideCallData();
		SP.functions.ready();
		//sforce.interaction.getPageInfo(saveLog);
	});

	Twilio.Device.connect(function (conn) {

		console.dir(conn);
		var	status = "";

		var callNum = null;
		if (conn.parameters.From) {
			callNum = conn.parameters.From;
			status = "Call From: " + callNum;
			SP.calltype = "Inbound";
		} else {
			status = "Outbound call";
			SP.calltype = "Outbound";

		}

		console.dir(conn);


		SP.functions.updateAgentStatusText("onCall", status);
		SP.functions.setOnCallState();
		SP.functions.detachAnswerButton();

		SP.currentCall = conn;
		SP.functions.attachMuteButton(conn);
		SP.functions.attachHoldButton(conn, SP.calltype);

		//send status info
		SP.functions.update_agent(SP.username,{
			status: 'OnCall'
		});	
	});

	/* Listen for incoming connections */
	Twilio.Device.incoming(function (conn) {


		// Update agent status 
		sforce.interaction.setVisible(true);	//pop up CTI console
		SP.functions.updateAgentStatusText("ready", ( conn.parameters.From), true);
		// Enable answer button and attach to incoming call
		SP.functions.attachAnswerButton(conn);
		SP.functions.setRingState();

		if (SP.requestedHold == true) {
			//auto answer
			SP.requestedHold = false;
			$("#action-buttons > button.answer").click();
		}
		var inboundnum = cleanInboundTwilioNumber(conn.parameters.From);
		var sid = conn.parameters.CallSid
		var result = "";
		//sfdc screenpop fields are specific to new contact screenpop
		sforce.interaction.searchAndScreenPop(inboundnum, 'con10=' + inboundnum + '&con12=' + inboundnum + '&name_firstcon2=' + name,'inbound');

	});

	Twilio.Device.cancel(function(conn) {
		console.log(conn.parameters.From); // who canceled the call
		SP.functions.detachAnswerButton();
		SP.functions.detachHoldButtons();
		SP.functions.hideCallData();
		SP.functions.notReady();
		SP.functions.setIdleState();

		$(".number").unbind();
		SP.currentCall = null;
		//SP.functions.updateStatus();
	});


	$("#callerid-entry > input").change( function() {
		$.post("/setcallerid", { "from":SP.username, "callerid": $("#callerid-entry > input").val() });
	});



	// Set server-side status to ready / not-ready
	SP.functions.notReady = function() {
		SP.functions.update_agent(SP.username,{
			status: 'NotReady'
		});	
		SP.agentsRef.trigger('get-ready-agents',{username: SP.username});
		SP.functions.updateStatus();
	}

	SP.functions.ready = function() {
		SP.functions.update_agent(SP.username,{
			status: 'Ready'
		});	
		SP.agentsRef.trigger('get-ready-agents',{username: SP.username});
		SP.functions.updateStatus();
	}


	// Check the status on the server and update the agent status dialog accordingly
	SP.functions.updateStatus = function() {
		var data = SP.agent.status;
		if (data == "NotReady" || data == "Missed") {
			SP.functions.updateAgentStatusText("notReady", "Not Ready")
		}
		
		if (data == "Ready") {
			SP.functions.updateAgentStatusText("ready", "Ready")
		}
	}

	/******** GENERAL FUNCTIONS for SFDC	***********************/

	function cleanInboundTwilioNumber(number) {
		//twilio inabound calls are passed with +1 (number). SFDC only stores 
		return number.replace('+1',''); 
	}

	function cleanFormatting(number) { 
		//changes a SFDC formatted US number, which would be 415-555-1212		 
		return number.replace(' ','').replace('-','').replace('(','').replace(')','').replace('+','');
	}


	function startCall(response) { 
			
		//called onClick2dial
		sforce.interaction.setVisible(true);	//pop up CTI console
		var result = JSON.parse(response.result);	
		var cleanednumber = cleanFormatting(result.number);


		//alert("cleanednumber = " + cleanednumber);	
		params = {"PhoneNumber": cleanednumber, "CallerId": $("#callerid-entry > input").val()};
		Twilio.Device.connect(params);

	} 

	var saveLogcallback = function (response) {
		if (response.result) {
			console.log("saveLog result =" + response.result);
		} else {
			console.log("saveLog error = " + response.error);
		}
	};


	function saveLog(response) {
/*			
		console.log("saving log result, response:");
		var result = JSON.parse(response.result);

		console.log(response.result);
		
		var timeStamp = new Date().toString();
		timeStamp = timeStamp.substring(0, timeStamp.lastIndexOf(':') + 3);			 
		var currentDate = new Date();			 
		var currentDay = currentDate.getDate();
		var currentMonth = currentDate.getMonth()+1;
		var currentYear = currentDate.getFullYear();
		var dueDate = currentYear + '-' + currentMonth + '-' + currentDay;
		var saveParams = 'Subject=' + SP.calltype +' Call on ' + timeStamp;

		saveParams += '&Status=completed';					
		saveParams += '&CallType=' + SP.calltype;	//should change this to reflect actual inbound or outbound
		saveParams += '&Activitydate=' + dueDate;
		saveParams += '&Phone=' + SP.state.callNumber;	//we need to get this from.. somewhere		
		saveParams += '&Description=' + "test description";	 

		console.log("About to parse	result..");
		
		var result = JSON.parse(response.result);
		var objectidsubstr = result.objectId.substr(0,3);
		// object id 00Q means a lead.. adding this to support logging on leads as well as contacts.
		if(objectidsubstr == '003' || objectidsubstr == '00Q') {
			saveParams += '&whoId=' + result.objectId;					
		} else {
			saveParams += '&whatId=' + result.objectId;			
		}
		
		console.log("save params = " + saveParams);
		sforce.interaction.saveLog('Task', saveParams, saveLogcallback);
*/
	}
});