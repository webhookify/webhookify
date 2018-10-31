const querystring = require('querystring');
const EventEmitter = require('events');
const { URL } = require('url');

const WebSocket = require('ws');
const mergeOptions = require('merge-options');
const ursa = require('ursa');

const ADDRESS = "wss://ws.webhookify.net";

class Protocol extends EventEmitter {
	/**
	 * Creates a new webhookify Protocol instance
	 * @param {String} clientId client id retrieved from the webhookify website
	 * @param {String} privateKey private key in PEM format (without passphrase) 
	 * @param {Object} options
	 * @param {Boolean} options.reconnect Try to reconnect if the connection is closed (Default: true)
	 * @param {Number} options.reconnectDelay Delay in milliseconds before the next connection attempt is started (Default: 2000)
	 * @param {Boolean} options.ignoreErrors If set to false, each connection error will be re-emitted as an error event (Default: true)
	 */
	constructor(clientId, privateKeyRaw, options) {
		if (clientId == undefined || privateKeyRaw == undefined) {
			throw new Error("Missing arguments");
		}

		super();

		this.clientId = clientId;
		this._privateKey = ursa.createPrivateKey(privateKeyRaw);

		this._options = mergeOptions({
			//default options are specified here:
			reconnect: true,
			ignoreErrors: true,
			reconnectDelay: 2000, // 2 seconds
		}, options);

		this._socket = null;
		this._reconnectTimeout = null;
		this._pingTimeout = null;

		this._disconnectEmitted = false;
	}

	_handleChallenge(id, payload) {
		let challenge = payload.challenge;

		let response = this._privateKey.decrypt(Buffer.from(challenge, "base64"), "utf8", "utf8");

		this.sendReply(id, { response });
	}

	_generateReplyFunction(id) {
		return ((err, response) => {
			return this.sendReply(id, response);
		});
	}

	_reconnect() {
		if (this._reconnectTimeout != null) return;

		this._reconnectTimeout = setTimeout(() => {
			this._reconnectTimeout = null;
			this.connect()
		}, this._options.reconnectDelay);
	}

	connect() {
		if (this._socket != null) {
			this._socket.terminate(); //kill old connection
			this._socket = null;
		}
		if(this._pingTimeout != null) {
			clearTimeout(this._pingTimeout);
		}

		let address = new URL(`/${this.clientId}`, ADDRESS);

		this._socket = new WebSocket(address);

		this._socket.on("open", () => {
			this._disconnectEmitted = false;
			this.emit("connected");
		});

		this._socket.on("close", (code, reason) => {
			if (!this._disconnectEmitted) {
				this._disconnectEmitted = true;
				this.emit("disconnected", { code, reason });
			}

			if (this._options.reconnect) {
				this._reconnect();
			}
		});

		this._socket.on("unexpected-response", (req, resp) => {
			if (!this._disconnectEmitted) {
				this._disconnectEmitted = true;
				this.emit("disconnected", { code: resp.statusCode, reason: "" });
			}

			if (this._options.reconnect) {
				this._reconnect();
			}
		});

		this._socket.on("error", (err) => {
			//console.log(err);
			if (!this._options.ignoreErrors) {
				this.emit("error", err);
			}
		});

		this._socket.on("message", (data) => {
			this.processMessage(data);
		});

		this._socket.on("ping", (data) => {
			if(this._pingTimeout != null) {
				clearTimeout(this._pingTimeout);
			}

			// the server sends out a ping every 20 seconds
			// if we dont receive one in 30 seconds, kill the connection and try to reconnect
			this._pingTimeout = setTimeout(() => {
				this.emit("disconnected", { code: 0, reason: "Ping timeout" });
				this._pingTimeout = null;
				if (this._options.reconnect) {
					this.connect();
				}
			}, 30000);
		});
	}

	processMessage(message) {
		let messageParsed = querystring.parse(message);

		let type = messageParsed.type;
		let id = messageParsed.id;
		let payloadRaw = messageParsed.payload;
		let plugin = messageParsed.plugin;

		if (type == undefined || id == undefined || payloadRaw == undefined) {
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

	/**
	 * Reply to message with an error
	 * @param {String} id message id
	 * @param {Error} err 
	 */
	sendError(id, err) {
		let message = this.encodeMessage("error", id, { message: err.message });

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