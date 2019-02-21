/**
 * Created by aborovsky on 27.08.2015.
 */

var util = require('util'),
    KnxConnectionTunneling = require('knx.js').KnxConnectionTunneling;

module.exports = function (RED) {

    var knxjs = require('knx.js');

    /**
     * ====== Knx-CONTROLLER ================
     * Holds configuration for knxjs host+port,
     * initializes new knxjs connections
     * =======================================
     */
    function KnxControllerNode(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.host = config.host;
        config.port = parseInt(config.port);
        this.port = config.port;
        this.mode = config.mode;
        this.knxjsconn = null;
        var node = this;
        //node.log("new KnxControllerNode, config: " + util.inspect(config));

        /**
         * Initialize an knxjs socket, calling the handler function
         * when successfully connected, passing it the knxjs connection
         */
        this.initializeKnxConnection = function (handler) {
            if (node.knxjsconn) {
                node.log('already connected to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                if (handler && (typeof handler === 'function'))
                    handler(node.knxjsconn);
                return node.knxjsconn;
            }
            node.log('connecting to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
            node.knxjsconn = null;
            if (config.mode === 'tunnel/unicast') {
                node.knxjsconn = new KnxConnectionTunneling(config.host, config.port, '0.0.0.0', 0);
                node.knxjsconn.Connect(function (err) {
                        if (err)
                            node.warn('cannot connect to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + '], cause: ' + util.inspect(err));
                        else
                            node.log('Knx: successfully connected to ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                        handler(node.knxjsconn);
                    }
                );
            }
            else
                throw 'Unsupported mode[' + config.mode + ']'
            return node.knxjsconn;
        };
        this.on("close", function () {
            node.log('disconnecting from knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
            node.knxjsconn && node.knxjsconn.Disconnect && node.knxjsconn.Disconnect();
        });
    }

    RED.nodes.registerType("knx-controller", KnxControllerNode);

    /**
     * ====== Knx-OUT =======================
     * Sends outgoing KNX telegrams from
     * messages received via node-red flows
     * =======================================
     */
    function KnxOut(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.ctrl = RED.nodes.getNode(config.controller);
        var node = this;
        //node.log('new Knx-OUT, config: ' + util.inspect(config));
        this.on("input", function (msg) {
            node.log('knxout.onInput, msg[' + util.inspect(msg) + ']');
            if (!(msg && msg.hasOwnProperty('payload'))) return;
            var payload;
            if (typeof(msg.payload) === "object") {
                payload = msg.payload;
            } else if (typeof(msg.payload) === "string") {
                payload = JSON.parse(msg.payload);
            }
            if (payload == null) {
                node.log('knxout.onInput: illegal msg.payload!');
                return;
            }
            if (payload.dstgad == null) {
            	node.log('knxout.onInput: illegal msg.payload.dstgad!');
                return;
            }
            var action;
            switch (true) {
                case /read/.test(msg.topic):
                    action = 'read';
                    break;
                case /respon/.test(msg.topic):
                    action = 'response';
                    break;
                default:
                    action = 'write';
            }
            if (payload.value == null)
            	action = 'read';
            this.groupAddrSend(payload.dstgad, payload.value, payload.dpt, action, function (err) {
                if (err) {
                    node.error('groupAddrSend error: ' + util.inspect(err));
                }
            });

        });
        this.on("close", function () {
            node.log('knxOut.close');
        });

        node.status({fill: "yellow", shape: "dot", text: "inactive"});

        function nodeStatusConnected() {
            node.status({fill: "green", shape: "dot", text: "connected"});
        }

        function nodeStatusDisconnected() {
            node.status({fill: "red", shape: "dot", text: "disconnected"});
        }

        function nodeStatusConnecting() {
            node.status({fill: "green", shape: "ring", text: "connecting"});
        }

        /**
         * send a group write telegram to a group address
         * Initializes new knxjs connection per request
         * dstgad: dest group address '1/2/34'
         * dpt: DataPointType eg. '1' for boolean
         * value: the value to write
         * callback:
         *
         * Usage:
         * groupAddrSend({ host: 'localhost', port: 6720}, '1/2/34', 1, 1, function(err) {
		*   if(err) console.error(err);
		* });
         *
         * Datatypes:
         *
         KNX/EIB Function                   Information length      EIS         DPT     Value
         Switch                             1 Bit                   EIS 1       DPT 1    0,1
         Dimming (Position, Control, Value) 1 Bit, 4 Bit, 8 Bit     EIS 2        DPT 3    [0,0]...[1,7]
         Time                               3 Byte                  EIS 3       DPT 10    Day [0..7] Hours [0..23] Minutes [0..59] Seconds [0..59]
         Date                               3 Byte                  EIS 4       DPT 11
         Floating point                     2 Byte                  EIS 5        DPT 9    -671088,64 - 670760,96
         8-bit unsigned value               1 Byte                  EIS 6        DPT 5    0...255
         8-bit unsigned value               1 Byte                  DPT 5.001    DPT 5.001    0...100
         Blinds / Roller shutter            1 Bit                   EIS 7        DPT 1    0,1
         Priority                           2 Bit                   EIS 8        DPT 2    [0,0]...[1,1]
         IEEE Floating point                4 Byte                  EIS 9        DPT 14    4-Octet Float Value IEEE 754
         16-bit unsigned value              2 Byte                  EIS 10        DPT 7    0...65535
         16-bit signed value                2 Byte                  DPT 8        DPT 8    -32768...32767
         32-bit unsigned value              4 Byte                  EIS 11        DPT 12    0...4294967295
         32-bit signed value                4 Byte                  DPT 13        DPT 13    -2147483648...2147483647
         Access control                     1 Byte                  EIS 12        DPT 15
         ASCII character                    1 Byte                  EIS 13        DPT 4
         8859_1 character                   1 Byte                  DPT 4.002    DPT 4.002
         8-bit signed value                 1 Byte                  EIS 14        DPT 6    -128...127
         14 character ASCII                 14 Byte                 EIS 15        DPT 16
         14 character 8859_1                14 Byte                 DPT 16.001    DPT 16.001
         Scene                              1 Byte                  DPT 17        DPT 17    0...63
         HVAC                               1 Byte                  DPT 20        DPT 20    0..255
         Unlimited string 8859_1            .                       DPT 24        DPT 24
         List 3-byte value                  3 Byte                  DPT 232        DPT 232    RGB[0,0,0]...[255,255,255]
         *
         */
        this.groupAddrSend = function (dstgad, value, dpt, action, callback) {
            dpt = dpt ? dpt.toString(): '1';
            if (action !== 'write' && action!== 'read')
                throw 'Unsupported action[' + action + '] inside of groupAddrSend';
            node.log('groupAddrSend action[' + action + '] dstgad:' + dstgad + ', value:' + value + ', dpt:' + dpt);
            if (action === 'write') {
            	switch (dpt) {
                case '1': //Switch
                    value = (value.toString() === 'true' || value.toString() === '1')
                    break;
                case '3': // Dimmer, control bit + 3 bit value
                    if (typeof(value.c) !== 'undefined' && value.c !== null &&
                    typeof(value.amount) !== 'undefined' && value.amount !== null) {
                      if (value.amount <= 7) {
                        value = ((value.c.toString() === 'true' || value.c.toString() === '1') << 3) |
                          parseInt(value.amount) & 7;
                        buf = new Buffer(1);
                        buf[0] = value & 15;
                        value = buf;
                      } else {
                        throw 'Value step amount too big for DPT 3';
                      }
                    } else if (!isNaN(parseInt(value))) {
                      buf = new Buffer(1);
                      buf[0] = parseInt(value) & 15;
                      value = buf;
                    } else if (!Buffer.isBuffer(value)) {
                      throw 'Value is incorrect for DPT 3 (type of value should be Buffer or Value = 0..15 or Object with fields "value.c" = 0..1 and "value.amount" = 0..7)';
                    }
                    break;
                case '9': //Floating point
                    value = parseFloat(value);
                    buf = new Buffer(4);
                    buf.writeFloatLE(value, 0);
                    value = buf;
                    break;
                case '5':    //8-bit unsigned value               1 Byte                  EIS 6         DPT 5    0...255
                case '5.001':    //8-bit unsigned value               1 Byte                  DPT 5.001    DPT 5.001    0...100
                case '6':    //8-bit signed value                 1 Byte                  EIS 14        DPT 6    -128...127
                case '7':    //16-bit unsigned value              2 Byte                  EIS 10        DPT 7    0...65535
                case '8':    //16-bit signed value                2 Byte                  DPT 8         DPT 8    -32768...32767
                case '10':   //Time                               3 Byte                  EIS 3         DPT 10    Day [0..7] Hour [0..23] Minutes [0..59] Seconds [0..59]
                    var day = 0;
                    var hours = 0;
                    var minutes = 0;
                    var seconds = 0;

                    // Get values from object or parse from input value as wire format
                    if (typeof(value.day) !== 'undefined' &&
                    typeof(value.hours) !== 'undefined' &&
                    typeof(value.minutes) !== 'undefined' &&
                    typeof(value.seconds) !== 'undefined') {
                        day = value.day;
                        hours = value.hours;
                        minutes = value.minutes;
                        seconds = value.seconds;
                    } else {
                        value = parseInt(value);
                        // Day 3 bit [0..7]
                        day = (value >> 21) & 0x07
                        // Hour 5 bit [0..23]
                        hours = (value >> 16) & 0x1F
                        // Minutes 6 bit [0..59]
                        minutes = (value >> 8) & 0x3F;
                        // Seconds 6 bit [0..59]
                        seconds = value & 0x3F;
                    }

                    // Limit to max. values
                    hours = (hours <= 23) ? hours : 23;
                    minutes = (minutes <= 59) ? minutes : 59;
                    seconds = (seconds <= 59) ? seconds : 59;

                    // Write 3 byte wire time format: | day, hour | minute | second |
                    buf = new Buffer(3);
                    buf[2] = seconds & 0x3F;
                    buf[1] = minutes & 0x3F;
                    buf[0] = ((day & 0x07) << 5) | hours & 0x1F;

                    value = buf;
                    break;
                case '12':   //32-bit unsigned value              4 Byte                  EIS 11        DPT 12    0...4294967295
                case '13':   //32-bit signed value                4 Byte                  DPT 13        DPT 13    -2147483648...2147483647
                case '16':   //String                            14 Byte                  DPT 16        DPT 16    ASCII or ISO 8859-1/Latin-1
                    buf = Buffer.alloc(14, 0);
                    // Limit length to 14 byte
                    if (value.length > 14) {
                        value = value.substr(0,14);
                    }
                    // Write object value into buffer
                    buf.fill(value, 0, value.length, 'ascii')
                    value = buf;
                    break;
                case '17':   //Scene                              1 Byte                  DPT 17        DPT 17    0...63
                case '20':   //HVAC                               1 Byte                  DPT 20        DPT 20    0..255
                    value = parseInt(value);
                    buf = new Buffer(2);
                    if (value <= 255) {
                        buf[0] = 0x00;
                        buf[1] = value & 255;
                        value = buf;
                    }
                    else if (value <= 65535) {
                        buf[0] = value & 255;
                        buf[1] = (value >> 8) & 255;
                        value = buf;
                    }
                    break;
                default:
                    throw 'Unsupported dpt[' + dpt + '] inside groupAddrSend of knx node'
                }
            }

            if (!this.ctrl)
                node.error('Cannot proceed groupAddrSend, cause no controller-node specified!');
            else
            // init a new one-off connection from the effectively singleton KnxController
            // there seems to be no way to reuse the outgoing conn in adreek/node-knxjs
                this.ctrl.initializeKnxConnection(function (connection) {

                    if (connection.connected)
                        nodeStatusConnected();
                    else
                        nodeStatusDisconnected();
                    connection.removeListener('connecting', nodeStatusConnecting);
                    connection.on('connecting', nodeStatusConnecting);
                    connection.removeListener('connected', nodeStatusConnected);
                    connection.on('connected', nodeStatusConnected);
                    connection.removeListener('disconnected', nodeStatusDisconnected);
                    connection.on('disconnected', nodeStatusDisconnected);

                    try {
                        node.log("sendAPDU: " + util.inspect(value));
                        if (action === 'read')
                        	connection.RequestStatus(dstgad.toString());
                        else if (action === 'write')
                        	connection.Action(dstgad.toString(), value, null);
                        callback && callback();
                    }
                    catch (err) {
                        node.error('error calling groupAddrSend: ' + err);
                        callback(err);
                    }
                });
        }
    }

    //
    RED.nodes.registerType("knx-out", KnxOut);

    /**
     * ====== KNX-IN ========================
     * Handles incoming KNX events, injecting
     * json into node-red flows
     * =======================================
     */
    function KnxIn(config) {
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = null;
        var node = this;
        //node.log('new KNX-IN, config: ' + util.inspect(config));
        var knxjsController = RED.nodes.getNode(config.controller);
        /* ===== Node-Red events ===== */
        this.on("input", function (msg) {
            if (msg != null) {

            }
        });
        var node = this;
        this.on("close", function () {
            if (node.receiveEvent && node.connection)
                node.connection.removeListener('event', node.receiveEvent);
            if (node.receiveStatus && node.connection)
                node.connection.removeListener('status', node.receiveStatus);
        });

        function nodeStatusConnecting() {
            node.status({fill: "green", shape: "ring", text: "connecting"});
        }

        function nodeStatusConnected() {
            node.status({fill: "green", shape: "dot", text: "connected"});
        }

        function nodeStatusDisconnected() {
            node.status({fill: "red", shape: "dot", text: "disconnected"});
        }

        node.receiveEvent = function (gad, data, datagram) {
            node.log('knx event gad[' + gad + ']data[' + data.toString('hex') + ']');
            node.send({
                topic: 'knx:event',
                payload: {
                    'srcphy': datagram.source_address,
                    'dstgad': gad,
                    'dpt': 'no_dpt',
                    'value': data.toString(),
                    'type': 'event'
                }
            });
        };
        node.receiveStatus = function (gad, data, datagram) {
            node.log('knx status gad[' + gad + ']data[' + data.toString('hex') + ']');
            node.send({
                topic: 'knx:status',
                payload: {
                    'srcphy': datagram.source_address,
                    'dstgad': gad,
                    'dpt': 'no_dpt',
                    'value': data.toString(),
                    'type': 'status'
                }
            });
        };

//		this.on("error", function(msg) {});

        /* ===== knxjs events ===== */
        // initialize incoming KNX event socket (openGroupSocket)
        // there's only one connection for knxjs-in:
        knxjsController && knxjsController.initializeKnxConnection(function (connection) {
            node.connection = connection;
            node.connection.removeListener('event', node.receiveEvent);
            node.connection.on('event', node.receiveEvent);
            node.connection.removeListener('status', node.receiveStatus);
            node.connection.on('status', node.receiveStatus);

            if (node.connection.connected)
                nodeStatusConnected();
            else
                nodeStatusDisconnected();
            node.connection.removeListener('connecting', nodeStatusConnecting);
            node.connection.on('connecting', nodeStatusConnecting);
            node.connection.removeListener('connected', nodeStatusConnected);
            node.connection.on('connected', nodeStatusConnected);
            node.connection.removeListener('disconnected', nodeStatusDisconnected);
            node.connection.on('disconnected', nodeStatusDisconnected);
        });
    }

    //
    RED.nodes.registerType("knx-in", KnxIn);
}
