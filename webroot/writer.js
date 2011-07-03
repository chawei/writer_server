if (typeof(REMOTE_IP) == "undefined") { alert('REMOTE_IP is undefined'); }
if (typeof(PORT) == "undefined") { alert('PORT is undefined'); }
socket = new io.Socket(REMOTE_IP, {port: PORT});

socket.connect();

socket.on('connect', function()
{
	sendObject({writer:true, writerNo:writerNo});
});

socket.on('message', function(data)
{ 
	// Lets parse the message, and then pass it to our handleServerMessage method for processing
	data = parseObject(data);
	if(data != null)handleServerMessage(data);
}); 

socket.on('disconnect', function()
{ 
	
});	

// ====================== General Client/JSON helper methods ========================

// Method for sending an object as a json string to a client
var sendObject = function(object){ socket.send(JSON.stringify(object)); },
// Method for parsing JSON strings
parseObject = function(obj){ try{obj = JSON.parse(obj); return obj;} catch(SyntaxError){console.log("bad json.\n\nMessage:\n" + obj + '\n\nError:\n' + SyntaxError);return null;}},



// ======================= Server Message callback method ===================

handleServerMessage = function(obj)
{
	if(obj.history)
	{
		var outputArea = document.getElementById("outputArea");
		if ( outputArea.hasChildNodes() )
		{
		    while ( outputArea.childNodes.length >= 1 )
		    {
		        outputArea.removeChild( outputArea.firstChild );       
		    } 
		}
		for(h in obj.history)
		{
			var entryText = document.createTextNode(obj.history[h].entryText);
			outputArea.appendChild(entryText);
		}
	}
},

sendMessage = function()
{
	var writingBox = document.getElementById("writingBox");
	if(writingBox.value != "")
	{
		sendObject({entryText:writingBox.value, writerNo:writerNo});
	}
},

captureKeypress = function(event)
{
	var unicode=event.charCode;
	if(unicode == "32" && (lastKeypress == "46" /* period */ || 
							lastKeypress == "63" /* question mark */|| 
							lastKeypress == "33" /* exclamation point */
							))
	{
		sendMessage();
		var writingBox = document.getElementById("writingBox").value = '';
	}

	lastKeypress = unicode;
},
lastKeypress = "",

setup = function()
{
	document.getElementById("writingBox").onkeypress = captureKeypress;
}