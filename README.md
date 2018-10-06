![logo]

[logo]: https://resource.literalchaos.de/img/webhookify/webhookify_small.png

Protocol implementation of the webhookify client protocol.
The specification of the protocol can be found on the [wiki](https://github.com/webhookify/webhookify/wiki/Protocol).

# Installation

Install the protocol stack by running

	npm i -S webhookify

# Usage

```javascript
// load module
const { Protocol } = require('webhookify');

// load private key and client id from somewhere
let clientId, privateKeyPEM;

// instantiate protocol
let connection = new Protocol(client, privateKeyPEM);

// connect to server
connection.connect();

// handle incoming events
connection.on("push", (plugin, payload) => {
	// push message with payload was received and is directed at plugin
});

connection.on("fetch", (plugin, payload, reply) => {
	// push fetch with payload was received and is directed at plugin

	// retrieve the requested data and call reply function with (err, response)
	reply(null, {});
});

connection.on("error", (err) => {
	console.log("An error occurred:", err.message);
});
```

# Reference

## class Protocol

**constructor**(clientId, privateKeyPem, options)  
Creates a new instance of the protocol. A valid clientId can be retrieved at https://www.webhookify.net and a valid private RSA key can be generated with the client or openssl for example.

The options parameter is an object with the following recognized keys:  
`reconnect` (boolean) [Default: `true`]  
`reconnectDelay` (number) [Default: `2000`]  
`ignoreErrors` (boolean) [Default: `true`]

**connect()**  
Initiates a connection to the webhookify server.

*All other methods are for internal use only, but they might be useful, if you plan on extending this class somehow*

**processMessage(message)**  
Parses the message string and invokes the appropriate action, either replying to the challenge or emitting a "push" or "fetch" event.

**sendReply(id, payload)**  
Encodes id and payload into a *reply* message, which is then sent to the server via the websocket connection.

**sendError(id, err)**  
Encodes id and `err.message` into an *error* message, which is then sent to the server via the websocket connection.

**encodeMessage(type, id, payload)**  
Creates a new message string with the specified parameters.

### Events

**Event 'push'**  
A *push* message was received from the server.
The handler is called with (plugin, payload).

**Event 'fetch'**  
A *fetch* message was received from the server, which now expects a reply within five seconds.
The handler is called with (plugin, payload, reply), where reply is a function with the signature (err, response).

**Event 'connected'**  
The websocket connection is (re-)established.

**Event 'disconnected'**  
The websocket connection was interrupted for some reason.

**Event 'error'**  
If the `ignoreErrors` option is set to `false`, the error events the socket encounters are passed on here.