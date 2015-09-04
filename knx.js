/**
 * Created by aborovsky on 27.08.2015.
 */

var KnxConnectionTunneling = require('knx.js').KnxConnectionTunneling;

function timestamp() {
    return new Date().
        toISOString().
        replace(/T/, ' ').      // replace T with a space
        replace(/\..+/, '')
}
function log(msg, args) {
    if (args)
        console.log(timestamp() + ': ' + msg, args);
    else
        console.log(timestamp() + ': ' + msg);
}

module.exports = function (RED) {

    log("loading knx.js for node-red");
    var knxjs = require('knx.js');

    /**
     * ====== Knx-CONTROLLER ================
     * Holds configuration for knxjs host+port,
     * initializes new knxjs connections
     * =======================================
     */
    function KnxControllerNode(config) {
        log("new KnxControllerNode, config: %j", config);
        RED.nodes.createNode(this, config);
        this.host = config.host;
        this.port = config.port;
        this.mode = config.mode;
        this.knxjsconn = null;
        var node = this;

        /**
         * Initialize an knxjs socket, calling the handler function
         * when successfully connected, passing it the knxjs connection
         */
        this.initializeKnxConnection = function (handler) {
            if (node.knxjsconn) {
                log('already connected to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                if (handler && (typeof handler === 'function'))
                    handler(node.knxjsconn);
                return node.knxjsconn;
            }
            log('connecting to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
            node.knxjsconn = null;
            if (config.mode === 'tunnel/unicast') {
                node.knxjsconn = new KnxConnectionTunneling(config.host, config.port, '0.0.0.0', 0);
                node.knxjsconn.Connect(function (err) {
                        if (handler && (typeof handler === 'function'))
                            handler(node.knxjsconn);
                        if (err) {
                            log('connecting to knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                            return null;
                        }
                        log('Knx: successfully connected to ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
                    }
                );
            }
            else
                throw 'Unsupported mode[' + config.mode + ']'
            return node.knxjsconn;
        };
        this.on("close", function () {
            log('disconnecting from knxjs server at ' + config.host + ':' + config.port + ' in mode[' + config.mode + ']');
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
        log('new Knx-OUT, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.ctrl = RED.nodes.getNode(config.controller);
        var node = this;
        //
        this.on("input", function (msg) {
            log('knxout.onInput, msg=%j', msg);
            if (!(msg && msg.hasOwnProperty('payload'))) return;
            var payload;
            if (typeof(msg.payload) === "object") {
                payload = msg.payload;
            } else if (typeof(msg.payload) === "string") {
                payload = JSON.parse(msg.payload);
            }
            if (payload == null) {
                log('knxout.onInput: illegal msg.payload!');
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
            this.groupAddrSend(payload.dstgad, payload.value, payload.dpt, action, function (err) {
                if (err) {
                    log('groupAddrSend error: %j', err);
                }
            });

        });
        this.on("close", function () {
            log('knxOut.close');
        });

        node.status({fill: "yellow", shape: "dot", text: "inactive"});

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
         Time                               3 Byte                  EIS 3        DPT 10
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
            dpt = dpt.toString();
            if (action !== 'write')
                throw 'Unsupported action[' + action + '] inside of groupAddrSend';
            log('groupAddrSend action[' + action + '] dstgad:' + dstgad + ', value:' + value + ', dpt:' + dpt);
            switch (dpt) {
                case '1': //Switch
                    value = (value.toString() === 'true' || value.toString() === '1')
                    break;
                case '9': //Floating point
                    value = parseFloat(value);
                    break;
                case '5':    //8-bit unsigned value               1 Byte                  EIS 6         DPT 5    0...255
                case '5.001':    //8-bit unsigned value               1 Byte                  DPT 5.001    DPT 5.001    0...100
                case '6':    //8-bit signed value                 1 Byte                  EIS 14        DPT 6    -128...127
                case '7':    //16-bit unsigned value              2 Byte                  EIS 10        DPT 7    0...65535
                case '8':    //16-bit signed value                2 Byte                  DPT 8         DPT 8    -32768...32767
                case '12':   //32-bit unsigned value              4 Byte                  EIS 11        DPT 12    0...4294967295
                case '13':   //32-bit signed value                4 Byte                  DPT 13        DPT 13    -2147483648...2147483647
                case '17':   //Scene                              1 Byte                  DPT 17        DPT 17    0...63
                case '20':   //HVAC                               1 Byte                  DPT 20        DPT 20    0..255
                    value = parseInt(value);
                    break;
                default:
                    throw 'Unsupported dpt[' + dpt + '] inside groupAddrSend of knx node'

            }

            // init a new one-off connection from the effectively singleton KnxController
            // there seems to be no way to reuse the outgoing conn in adreek/node-knxjs
            this.ctrl.initializeKnxConnection(function (connection) {

                if (connection.connected)
                    node.status({fill: "green", shape: "dot", text: "connected"});
                else
                    node.status({fill: "red", shape: "dot", text: "disconnected"});
                connection.on('connecting', function () {
                    node.status({fill: "yellow", shape: "dot", text: "connecting"});
                });
                connection.on('connected', function () {
                    node.status({fill: "green", shape: "dot", text: "connected"});
                });
                connection.on('disconnected', function () {
                    node.status({fill: "red", shape: "dot", text: "disconnected"});
                });

                try {
                    log("sendAPDU: %j", JSON.stringify(value));
                    connection.Action(dstgad.toString(), value, dpt);
                    callback && callback();
                }
                catch (err) {
                    log('error calling groupAddrSend!: %j', err);
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
        log('new KNX-IN, config: %j', config);
        RED.nodes.createNode(this, config);
        this.name = config.name;
        this.connection = null;
        var node = this;
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
//		this.on("error", function(msg) {});

        /* ===== knxjs events ===== */
        // initialize incoming KNX event socket (openGroupSocket)
        // there's only one connection for knxjs-in:
        knxjsController.initializeKnxConnection(function (connection) {

            node.receiveEvent = function (gad, data, datagram) {
                log('knx event gad[' + gad + ']data[' + data.toString('hex') + ']');
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
                log('knx status gad[' + gad + ']data[' + data.toString('hex') + ']');
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
            node.connection = connection;
            node.connection.on('event', node.receiveEvent);
            node.connection.on('status', node.receiveStatus);

            node.status({fill: "yellow", shape: "dot", text: "connecting"});
            if (node.connection.connected)
                node.status({fill: "green", shape: "dot", text: "connected"});
            else
                node.status({fill: "red", shape: "dot", text: "disconnected"});
            node.connection.on('connecting', function () {
                node.status({fill: "yellow", shape: "dot", text: "connecting"});
            });
            node.connection.on('connected', function () {
                node.status({fill: "green", shape: "dot", text: "connected"});
            });
            node.connection.on('disconnected', function () {
                node.status({fill: "red", shape: "dot", text: "disconnected"});
            });
        });
    }

    //
    RED.nodes.registerType("knx-in", KnxIn);
}
