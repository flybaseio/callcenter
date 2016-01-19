var express = require('express');
var bodyParser = require('body-parser');
var methodOverride = require('method-override');
var path = require('path');
var q = require('q');
var bluebird = require('bluebird');

var config = require( path.join(__dirname, 'app', 'config') );

var app = express();
app.set('views', path.join(__dirname, 'app', 'views'));
app.engine('html', require('ejs').renderFile);
app.set('view engine', 'html');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({	extended: true	}));
app.use(express.static( path.join(__dirname, 'app', 'public')));
 
var port = process.env.PORT || 5000; // set our port


var twilio = require('twilio');
var client = twilio(config.twilio.sid, config.twilio.token);

var flybase = require('flybase');
var callsRef = flybase.init(config.flybase.app_name, "calls", config.flybase.api_key);
var agentsRef = flybase.init(config.flybase.app_name, "agents", config.flybase.api_key);
var queueid = '';
var good2go = false;

// backend routes =========================================================
client.queues.list(function(err, data) {
	var to_go = data.queues.length;
    data.queues.forEach(function(queue) {
		if( queue.friendlyName === config.twilio.queueName ){
			queueid = queue.sid;
			console.log( "Queueid = #" + queueid + " for #" +  config.twilio.queueName );
			good2go = true;
		}
		to_go--;
		if( to_go == 0 ){
			good2go = true;
		}
    });
});

var qNag = function() {
	if( good2go ){
		if( queueid === '' ){
			client.queues.create({
				friendlyName: config.twilio.queueName
			}, function(err, queue) {
				queueid = queue.sid;
			});	
		}
	}else{
		setTimeout(qNag, 1500);		
	}
};
setTimeout(qNag, 1500);

// listen for events via Flybase...

// if an agent gets disconnected then we log them off...
agentsRef.on('agent-removed', function (data) {
	var data = JSON.parse( data );
	console.log( data.username + " has left the building");
	update_agent(data.username,{
		status: 'LoggedOut'
	});	
});

// return number of agents with status set to Ready
agentsRef.on('get-ready-agents', function (data) {
	var adNag = function() {
		agentsRef.where({"status": 'Ready'}).on('value',function( rec ){
			console.log( rec.count() + ' agents are Ready' );
			if( rec.count() ){
				agentsRef.trigger('agents-ready', rec.count() );
			}else{
				agentsRef.trigger('agents-ready', "0" );
			}
		});
	};
	setTimeout(adNag, 1500);
});

//	listen for outgoing calls
app.post('/dial', function (req, res) {
	var phonenumber = req.param('PhoneNumber');
	var dial_id = config.twilio.fromNumber;
	if( typeof req.param('CallerID') !== 'undefined' ){
		var dial_id = req.param('CallerID');
	}
	var twiml = new twilio.TwimlResponse();
	twiml.dial(phonenumber, { 
		callerId:dial_id
	});
	console.log("Response text for /dial post = #", twiml.toString());
	res.writeHead(200, {
		'Content-Type':'text/xml'
	});
	res.end( twiml.toString() );
});


//	listen for incoming calls
app.post('/voice', function (req, res) {
	var queuename = config.twilio.queueName;
	var sid = req.param('CallSid');
	var callerid = req.param('Caller');

	var addtoq = 0;
	var dialqueue = '';
	var client_name = '';
	
	//	search for agent who has been set to `Ready` for the longest time and connect them to the caller...
	getlongestidle(true, function( bestclient ){
		if( bestclient ){
			console.log("Routing incoming voice call to best agent = #", bestclient);
			var client_name = bestclient;
		}else{
			var dialqueue = queuename;
			addtoq = 1;
		}
	
		var twiml = new twilio.TwimlResponse();
		if( addtoq ){
			twiml.say("Please wait for the next available agent",{
				voice:'woman',
				language:'en-gb'
			});
			twiml.enqueue( 
				{waitUrl: "http://s3.amazonaws.com/com.twilio.sounds.music/index.xml"},
				config.twilio.queueName 
			);	//	.pause({ length:3 }).redirect('/voice')
		}else{
			twiml.dial({
				'timeout':'10',
				'action':'/handledialcallstatus',
				'callerId':callerid
			}, function(node) {
				this.client( client_name );
			});
			update_call(sid, {
				'sid': sid,
				'agent': client_name,
				'status': 'ringing'
			});
		}
		res.writeHead(200, {
			'Content-Type':'text/xml'
		});
		res.end( twiml.toString() );
		console.log("Response text for /voice post = #", twiml.toString());
	});
});

app.post('/handledialcallstatus', function (req, res) {
	var sid = req.param('CallSid');
	var twiml = new twilio.TwimlResponse();

	if( req.param('DialCallStatus') == 'no-answer' ){
		callsRef.where({"sid": sid}).on('value',function( rec ){
			if( rec.count() !== null ){
				var sidinfo = rec.first().value();
				if( sidinfo ){
					var agent = sidinfo.agent;
					update_agent(agent, {
						'status': 'missed'
					});
				}
				// Change agent status for agents that missed calls
			}
			//	redirect and try to get new agent...
			twiml.redirect('/voice');
		});
	}else{
		twiml.hangup();
	}
	console.log("Response text for /handledialcallstatus post = #", twiml.toString());
	res.writeHead(200, {
		'Content-Type':'text/xml'
	});
	res.end( twiml.toString() );
});

// assign a twilio call token to the agent
app.get('/token', function(req, res) {
	var client_name = "anonymous";
	if( typeof req.param("client") !== "undefined" ){
		client_name = req.param("client");
	}
	
	var capability = new twilio.Capability( config.twilio.sid, config.twilio.token );
	capability.allowClientIncoming( client_name );
	capability.allowClientOutgoing( config.twilio.appid );
    var token = capability.generate();

    res.end(token);	
});

// return flybase info to the softphone...
app.get('/getconfig', function(req, res) {
	res.json({
		app_name: config.flybase.app_name,
		api_key: config.flybase.api_key
	});
});

// return a phone number
app.get('/getcallerid', function(req, res) {
	var client_name = "anonymous";
	if( typeof req.param("from") !== "undefined" ){
		client_name = req.param("from");
	}
	res.end( config.twilio.fromNumber );
});


app.post('/track', function(req, res) {
	
});

app.get('/', function(req, res) {
	var client_name = "anonymous";
	if( typeof req.param("client") !== "undefined" ){
		client_name = req.param("client");
	}
	
	res.render('index', {
		client_name: client_name,
		anycallerid: 'none'
	});
}); 

var server = app.listen(port, function() {
	console.log('Listening on port %d', server.address().port);
});


// call queue handling =========================================================
var qsum = 0;

var checkQueue = function() {
	qsum += 1;
	var qsize = 0;
	var readyagents = 0;
	var qname = config.twilio.queueName;
	client.queues(queueid).get(function(err, queue) {
		client.queues(queueid).members.list(function(err, members) {
			qsize = queue.CurrentSize;
			if( qsize > 0 ){
				var topmember = members[0];
				agentsRef.where({"status": "Ready"}).orderBy( {"readytime":-1} ).on('value',function( agents ){
					if( agents.count() ){
						var readyagents = agents.count();
						var bestclient = agents.first().value();
						console.log("Found best client - routing to #" + bestclient.client + " - setting agent to DeQueuing status so they aren't sent another call from the queue");
						update_agent(bestclient.client, {status: "DeQueing" });
						client.queues(queueid).members(topmember.CallSid).update({
							url: "/voice",
							method: "POST"
						}, function(err, member) {
	//						console.log(member.position);
						});
					}else{
						console.log("No Ready agents during queue poll #" + qsum);
					}
					agentsRef.trigger('agents-ready', readyagents );
					agentsRef.trigger('in-queue', qsize );
	
					// restart the check checking
					setTimeout(checkQueue, 3500);		
				});
			}else{
				// restart the check checking
				setTimeout(checkQueue, 3500);		
			}
		});
	});	
};
setTimeout(checkQueue, 3500);



// various functions =========================================================

//	find the caller who's been `Ready` the longest
function getlongestidle( callrouting, callback ){
	if( callrouting ){
		agentsRef.where({"status": "DeQueuing"}).orderBy( {"readytime":-1} ).on('value',function( data ){
			if( data.count() ){
				var agent = data.first().value();
				callback( agent.client );
			}else{
				agentsRef.where({"status": "Ready"}).orderBy( {"readytime":-1} ).on('value',function( data ){
					if( data.count() ){
						var agent = data.first().value();
						callback( agent.client );
					}
				});
			}
		});

	}else{
		agentsRef.where({"status": "Ready"}).orderBy( {"readytime":-1} ).on('value',function( data ){
			if( data.count() ){
				var agent = data.first().value();
				callback( agent.client );
			}
		});
	}
}


// check if user exists and if they do then we update, otherwise we insert...
function update_agent(client, data){
	var d = new Date();
	var date = d.toLocaleString();
	agentsRef.where({"client": client}).on('value',function( rec ){
		if( rec.count() !== null ){
			var agent = rec.first().value();
			for( var i in data ){
				agent[i] = data[i];
			}
			agentsRef.push(agent, function(resp) {
				console.log( "agent updated" );
			});				
		}else{
			data.client = client;
			agentsRef.push(data, function(resp) {
				console.log( "agent inserted" );
			});				
		}
	});
}

function update_call(sid, data){
	var d = new Date();
	var date = d.toLocaleString();
	callsRef.where({"sid": sid}).on('value',function( rec ){
		if( rec.count() !== null ){
			var call = rec.first().value();
			for( var i in data ){
				call[i] = data[i];
			}
			callsRef.push(call, function(resp) {
				console.log( "call updated" );
			});				
		}else{
			data.sid = sid;
			callsRef.push(data, function(resp) {
				console.log( "call inserted" );
			});				
		}
	});
}