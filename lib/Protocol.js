const querystring = require('querystring');
const util = require('util');
const EventEmitter = require('events');

const WebSocket = require('ws');
const mergeOptions = require('merge-options');

const ADDRESS = "ws://localhost:8081";

class Protocol extends EventEmitter {
	/**
	 * Creates a new webhookify Protocol instance
	 * @param {String} clientId client id retrieved from the webhookify website
	 * @param {String} privateKey private key in PEM format (without passphrase) 
	 * @param {Object} options
	 * @param {Boolean} options.reconnect Try to reconnect every 2 seconds if the connection is closed (Default: true)
	 */
	constructor(clientId, privateKey, options) {
		if (clientId == undefined || privateKey == undefined) {
			throw new Error("Missing arguments");
		}

		this.clientId = clientId;

		this._privateKey = privateKey;
		this._options = mergeOptions({
			//default options are specified here:
			reconnect: true
		}, options);

		this._socket = null;
	}

	_handleChallenge(id, payload) {

	}

	_generateReplyFunction(id) {
		return ((response) => {
			return this.sendReply(id, response);
		});
	}

	connect() {
		if (this._socket != null) {
			this._socket.terminate(); //kill old connection
			this._socket = null;
		}

		this._socket = new WebSocket(ADDRESS);

		this._socket.on("close", (code, reason) => {
			this.emit("disconnected", reason);
		});

		this._socket.on("error", (err) => {
			this.emit("error", err); //just pass the error onto the user of the protocol
		});

		this._socket.on("message", (data) => {
			this.processMessage(message);
		});
	}

	processMessage(message) {
		let messageParsed = querystring.parse(message);

		let type = messageParsed.type;
		let id = messageParsed.id;
		let payloadRaw = messageParsed.payload;
		let plugin = messageParsed.plugin;

		if (type == undefined || id == undefined || payload == undefined) {
			return; //ignore the incomplete/invalid message
		}

		if (!["push", "fetch", "challenge"].includes(type)) {
			return; //we do not expect any other message types
		}

		let payload;
		try {
			payload = JSON.parse(payloadRaw);
		} catch(e) {
			return; //ignore message
		}

		switch(type) {
			case "challenge":
				return this._handleChallenge(id, payload);
			case "push":
				return this.emit("push", plugin, payload);
			case "fetch":
				return this.emit("fetch", plugin, payload, this._generateReplyFunction(id));
		}
	}

	/**
	 * Reply to message with a payload
	 * @param {String} id message id
	 * @param {Object} payload 
	 */
	sendReply(id, payload) {
		let message = this.encodeMessage("reply", id, payload);

		return new Promise((resolve) => {
			this._socket.send(message, {}, () => {
				resolve();
			});
		});
	}

	encodeMessage(type, id, payload) {
		let messageObject = {
			type,
			id,
			payload: JSON.stringify(payload)
		};

		return querystring.stringify(messageObject);
	}
}

module.exports = { Protocol };