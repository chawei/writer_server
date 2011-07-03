// ============= Initalize Node.js and packages ================
var http = require('http'),

	// Websockets - socket.io
	io = require('socket.io'),
	
	// Paperboy for static files
  	sys = require('sys'),
  	path = require('path'),
  	paperboy = require('paperboy'),

	// Root directory for paperboy
	WEBROOT = path.join(path.dirname(__filename), 'webroot'),
	
	writers = [null, null, null],
	writersHistory = [new Array(), new Array(), new Array()],
	entryHistory = new Array(),
	
	connectedProjectors = new Array(),
	connectedPrinters = new Array(),
	currentAnalysis,

	// ============= General Client/JSON helper methods =============
	// Method for sending an object as a json string to a client
	sendObject = function(client, object){ if(client!=null)client.send(JSON.stringify(object)); },
	// Method for parsing JSON strings
	parseObject = function(obj){ try{obj = JSON.parse(obj); return obj;} catch(SyntaxError){console.log("bad json.\n\nMessage:\n" + obj + '\n\nError:\n' + SyntaxError);return null;}};


var server = http.createServer(function(req, res){
	paperboy
	    .deliver(WEBROOT, req, res)
	    .before(function() {
	      sys.puts('About to deliver: '+req.url);
	    })
	    .after(function() {
	      sys.puts('Delivered: '+req.url);
	    })
	    .error(function() {
	      sys.puts('Error delivering: '+req.url);
	    })
	    .otherwise(function() {
	      sys.puts('404');
	    });
});
server.listen(8080); // Listen on port 8000

// Setup our websockets, socket.io
var socket = io.listen(server); // Listen on our html server
socket.on('connection', function(client)
{
	
	// Set the callbacks for the other client events
	client.on('message', function(data)
	{
		// The message json object
		var obj = parseObject(data);
		
		// If there was no error parsing, then continue
		if(obj != null)
		{
			handleClientMessage(client, obj);
		}
	});

	client.on('disconnect', function()
	{
		for(w in writers)
		{
			if(writers[w] != null)
			{
				if(writers[w] == this)
				{
					writers[w] = null;
				}
			}
		}
		for(p in connectedProjectors)
		{
			if(connectedProjectors[p] != null)
			{
				if(connectedProjectors[p] == this)
				{
					connectedProjectors[p] = null;
				}
			}
		}
		/*
		for(p in connectedPrinters[p])
		{
			if(connectedPrinters[p] != null)
			{
				if(connectedPrinters[p] == this)
				{
					connectedPrinters[p] = null;
				}
			}
		}*/
	});

});

// ============================ Handle Client Messages ======================

var handleClientMessage = function(client, obj)
{
	// If the json object responds to writer, then a writer is loging in
	if(obj.writer)
	{
		/*
		if(writers[obj.writerNo] == null)
		{*/
			console.log("writer #" + obj.writerNo + " has logged in!");
			
			// Set that writer slot to our new client
			writers[obj.writerNo] = client;
			
			// Send over the writersHistory for that writer (WRITER UPDATE HISTORY)
			sendObject(client, {history : writersHistory[obj.writerNo]});
		/*}
		else
		{
			// (WRITER ERROR)
			console.log("Cannot login as that writer, because there is someone already logged into that writer.");
			sendObject(client, {error:"Another user has already logged into this writer."});
		}*/
	}
	else if(obj.entryText)
	{
		/*if(client == writers[obj.writerNo])
		{*/
			// Create rawEntry object for the writer's entry
			var rawEntry = new Object();
			rawEntry.entryText = obj.entryText;
			rawEntry.writerNo = obj.writerNo;
			rawEntry.time = new Date();
			rawEntry.topics = [];
			rawEntry.addTopic = function(topic)
			{
				// Create our topic object to represent a topic in this writer's text
				var topicObject = new Object();

				// Remember what the root of this topic is for hightlighting
				topicObject.rootTopic = topic;

				// Create our synonyms list which we'll use to store thesaurus results and compare to other writer's topics. Also our root topic is the first entry, because it won't come up as a synonym.
				topicObject.synonyms = [topic];

				topicObject.compare = function(topicObject)
				{
					for(s in this.synonyms)
					{
						for(y in topicObject.synonyms)
						{
							if(this.synonyms[s].toLowerCase() == topicObject.synonyms[y].toLowerCase())
							{
								return true;
							}
						}
					}
					return false;
				};


				// Add this topic to our topics array.
				this.topics.push(topicObject);
			};
			
			// Add the rawEntry to our entryHistory
			entryHistory.push(rawEntry);
			
			// Add the rawEntry to our writersHistory
			writersHistory[rawEntry.writerNo].push(rawEntry);
			
			// Send over the writersHistory for that writer (WRITER UPDATE HISTORY)
			sendObject(client, {history : writersHistory[obj.writerNo]});
			
			var queryString = '/calls/text/TextGetRankedKeywords?apikey=' + alchemyAPIKey + '&outputMode=json&text="' + encodeURI(rawEntry.entryText)+'"';

			// create our http request to alchemyapi
			var request = http.request({
			      host: "access.alchemyapi.com",
			      port: 80,
				  method: 'GET',
			      path: queryString
			}, function(response)
			{
				response.responseData = "";
				response.on('data', function (chunk) {
				    this.responseData = this.responseData + chunk;
				  });
				response.on('end', function()
				{
					
					// The message json object
					var obj = parseObject(this.responseData);
					// If there was no error parsing, then continue
					if(obj != null)
					{
						for(k in obj.keywords)
						{
							this.entry.addTopic(obj.keywords[k].text);
						}
						updateProjectors(); // Update after you get the topics, update the projectors
					}
					
				});
				response.entry = rawEntry;
			});
			request.entry = rawEntry;
			request.end();
			
			// Update projectors (UPDATE PROJECTOR)
			updateProjectors();
		/*}
		else
		{
			// (WRITER ERROR)
			console.log("Cannot accept entry from writer, because there is someone else logged into that writer.");
			sendObject(client, {error:"Not logged in as this writer, cannot accept entry."});
		}*/
	}

	// If the json object responds to projector, then its a projector
	else if(obj.projector)
	{
		client.projectorNumber = connectedProjectors.length;
		connectedProjectors.push(client);
	}
	
	else if(obj.printer)
	{
		client.printerNumber = connectedPrinters.length;
		connectedPrinters.push(client);
	}
};

var updatePrinters = function()
{
	var curTime = new Date();
	var printerOutput = new Object();
	printerOutput.writers = [];
	for(i = 0; i < 3; i++)
	{
		var writerText = "";
		
		for(g = writersHistory[i].length-1; g >= 0; g--)
		{
			console.log(writersHistory[i][g].time.getTime() + " " +(curTime.getTime() + printInterval));
			if(writersHistory[i][g].time.getTime() + printInterval > curTime.getTime())
			{
				writerText = writersHistory[i][g].entryText + writerText;
			}
			else g = -1;
		}
		printerOutput.writers.push(writerText);
	}
	
	printerOutput.time = curTime;
	
	for(p in connectedPrinters)
	{
		sendObject(connectedPrinters[p], printerOutput);
	}
};
var printInterval = 20000;
setInterval(updatePrinters, printInterval);

// Update projectors by retrieving writer's histories and analyzing them for topics, geting thesaurus equivolents, checking for commonalities between writers' topics/topic synonyms, searching texts for them and setting highlight array, and sending UPDATE PROJECTOR to projectors
var writerCharacterLimit = 8000;
var alchemyAPIKey = 'eb7e36d8dc835542612db74e1a6fc73c109d76ab';
var bigHugeThesaurusAPIKey = '1eba429a9ad4633f02fbd3b3f6cc9178';
var updateProjectors = function()
{
	// This will be the object that all the api http requests pass around. It gets disposed once the projector state is sent to all of the connected projectors (once all analysis is finished).
	var analysisObject = new Object();
	
	var writersTexts = [[],[],[]];
	
	// Create our projectorState object
	var projectorState = new Object();
	
	projectorState.writers = [];
	
	// Create writerOutputs for each writer
	for(i = 0; i < 3; i++)
	{
		// Initialize our new writerOutput object
		var writerOutput = new Object();
		writerOutput.text = "";
		writerOutput.highlight = [];
		
		// Determine what text we're going to analyze and send to the projectors
		for(g = writersHistory[i].length-1; g >= 0; g--)
		{
			// Create a new string with the text we've been adding and the next oldest input
			var newText = writersHistory[i][g].entryText + writerOutput.text;
			writersTexts[i][g] = writersHistory[i][g];
			// If it pushes us over the character limit, lets break out of this for loop
			if(newText.length > writerCharacterLimit) g = -1;
			// If it doesn't, then lets set our writerOutput text to our new text
			else
			{
				writerOutput.text = newText;
			}
		}
		
		// Create our highlight data for each character in writerOutput.text
		for(k = 0; k < writerOutput.text.length; k++)
		{
			writerOutput.highlight.push(0);
		}
		
		// Add our new writerOutput to our projectorState
		projectorState.writers.push(writerOutput);
	}
	
	
	// add the projector state to our analysis object
	analysisObject.projectorState = projectorState;
	
	
	analysisObject.highlight = function(writerNumber, textToHighlight)
	{
		var indexes = [];
		textToHighlight = textToHighlight.toLowerCase();
		var tempText = this.projectorState.writers[writerNumber].text.toLowerCase();
		var lastIndex = -1;
		
		// Find all instances of the text to highlight in the writer's text
		while(tempText.indexOf(textToHighlight, lastIndex) != -1)
		{
			indexes.push(tempText.indexOf(textToHighlight, lastIndex));
			lastIndex = tempText.indexOf(textToHighlight, lastIndex)+textToHighlight.length;
		}
		
		for(i in indexes)
		{
			// Upgrade previous sentance to 1's. Look 2 '.' (periods) ahead.
			var periodsFound = 0;
			var currentIndex = indexes[i];
			while(periodsFound < 2 && currentIndex >= 0)
			{
				if(tempText.charAt(currentIndex) == '.' ||
					tempText.charAt(currentIndex) == '!' ||
					tempText.charAt(currentIndex) == '?')
				{
					periodsFound += 1;
				}
				if(periodsFound < 2)
				{
					if(this.projectorState.writers[writerNumber].highlight[currentIndex] == 0)this.projectorState.writers[writerNumber].highlight[currentIndex] = 1;
				}
				currentIndex -= 1;
			}
			
			// Upgrade following sentance to 1's.
			periodsFound = 0;
			currentIndex = indexes[i];
			while(periodsFound < 2 && currentIndex < tempText.length)
			{
				if(tempText.charAt(currentIndex)  == '.' ||
					tempText.charAt(currentIndex) == '!' ||
					tempText.charAt(currentIndex) == '?')
				{
					periodsFound += 1;
				}
				
				if(this.projectorState.writers[writerNumber].highlight[currentIndex] == 0)this.projectorState.writers[writerNumber].highlight[currentIndex] = 1;
				currentIndex += 1;
			}
			
			// Upgrade highlighted text to a 2
			for(l = 0; l < textToHighlight.length; l++)
			{
				this.projectorState.writers[writerNumber].highlight[indexes[i] + l] = 2;
			}
		}
	};
	
	var writersTopics = [[],[],[]];
	for(i = 0; i < 3; i++)
	{
		for(t in writersTexts[i])
		{
			for(topic in writersTexts[i][t].topics)
			{
				writersTopics[i].push(writersTexts[i][t].topics[topic]);
			}
		}
	}
	analysisObject.writersTopics = writersTopics;
	
	analysisObject.compareWritersTopics = function()
	{
		console.log("comparing topics");
		for(writer1 = 0; writer1 < 2; writer1++)
		{
			for(writer2 = writer1+1; writer2 < 3; writer2++)
			{
				for(topic1 in this.writersTopics[writer1])
				{
					for(topic2 in this.writersTopics[writer2])
					{
						if(this.writersTopics[writer1][topic1].compare
							(this.writersTopics[writer2][topic2]))
						{
							this.highlight(writer1, this.writersTopics[writer1][topic1].rootTopic);
							this.highlight(writer2, this.writersTopics[writer2][topic2].rootTopic);
						}
					}
				}
			}
		}
			
		for(p in connectedProjectors)
		{
			sendObject(connectedProjectors[p], this.projectorState);
		}
	};
	
	analysisObject.compareWritersTopics();
}

// Analyze writer 2 text topics
	// Analyze writer 3 text topics
		// Get writer 1 topics synonyms
			// Get writer 2 topics synonyms
				// Get writer 3 topics synonyms
					// Check if topics/syns from writer 1 match any topics/syns from writer 2
						// Highlight topic from writer 1 and 2 with a 3 and give surrounding sentances a 2 unless they are already a 3
					// Check if topics/syns from writer 1 match any topics/syns from writer 3
						// Highlight topic from writer 1 and 3 with a 3 and give surrounding sentances a 2 unless they are already a 3
					// Check if topics/syns from writer 2 match any topics/syns from writer 3
						// Highlight topic from writer 2 and 3 with a 3 and give surrounding sentances a 2 unless they are already a 3
					// Save projectorState as currentProjectorState
					// Send projectorState to connected projectors (UPDATE PROJECTOR)
