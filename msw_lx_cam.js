/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const mqtt = require('mqtt');
const fs = require('fs');
const spawn = require('child_process').spawn;
const {nanoid} = require('nanoid');
const util = require("util");
const request = require('request');

global.sh_man = require('./http_man');

let fc = {};
let config = {};

config.name = 'msw_lx_cam';
global.drone_info = '';

try {
    drone_info = JSON.parse(fs.readFileSync('../drone_info.json', 'utf8'));

    config.directory_name = config.name + '_' + config.name;
    config.gcs = drone_info.gcs;
    config.drone = drone_info.drone;
    config.lib = [];
} catch (e) {
    config.directory_name = '';
    config.gcs = 'KETI_MUV';
    config.drone = 'FC_MUV_01';
    config.lib = [];
}

// library 추가
let add_lib = {};
try {
    add_lib = JSON.parse(fs.readFileSync('./lib_lx_cam.json', 'utf8'));
    config.lib.push(add_lib);
} catch (e) {
    add_lib = {
        name: 'lib_lx_cam',
        target: 'armv7l',
        description: '[name] [server]',
        scripts: "sh lib_lx_cam.sh",
        data: ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"],
        control: ['Capture']
    };
    config.lib.push(add_lib);
}

let msw_sub_mobius_topic = [];

let msw_sub_fc_topic = [];
msw_sub_fc_topic.push('/Mobius/' + config.gcs + '/Drone_Data/' + config.drone + '/global_position_int');

let msw_sub_lib_topic = [];

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                if (msw_mqtt_client !== null) {
                    let uri = 'Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name;
                    let cnt = 'Captured_GPS';
                    DeleteSubscription(uri, cnt);

                    for (let i = 0; i < config.lib[idx].control.length; i++) {
                        let sub_container_name = config.lib[idx].control[i];
                        let _topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + sub_container_name;
                        msw_mqtt_client.subscribe(_topic);
                        local_msw_mqtt_client.subscribe(_topic);
                        msw_sub_mobius_topic.push(_topic);
                        console.log('[msw_mqtt] msw_sub_mobius_topic[' + i + ']: ' + _topic);
                    }

                    for (let i = 0; i < config.lib[idx].data.length; i++) {
                        let container_name = config.lib[idx].data[i];
                        let _topic = '/MUV/data/' + config.lib[idx].name + '/' + container_name;
                        local_msw_mqtt_client.subscribe(_topic);
                        msw_sub_lib_topic.push(_topic);
                        console.log('[lib_mqtt] msw_sub_lib_topic[' + i + ']: ' + _topic);
                    }
                }

                let obj_lib = config.lib[idx];
                setTimeout(runLib, 1000 + parseInt(Math.random() * 10), JSON.parse(JSON.stringify(obj_lib)));
            }
        }
    }
}

function runLib(obj_lib) {
    try {
        let scripts_arr = obj_lib.scripts.split(' ');
        if (config.directory_name === '') {

        } else {
            scripts_arr[0] = scripts_arr[0].replace('./', '');
        }
        let run_lib = spawn(scripts_arr[0], [scripts_arr[1], drone_info.host, drone_info.drone]);

        run_lib.stdout.on('data', function (data) {
            console.log('stdout: ' + data);
        });

        run_lib.stderr.on('data', function (data) {
            console.log('stderr: ' + data);
        });

        run_lib.on('exit', function (code) {
            console.log('exit: ' + code);
        });

        run_lib.on('error', function (code) {
            console.log('error: ' + code);
        });
    } catch (e) {
        console.log(e.message);
    }
}

let sub_rn = 'lx_monitor';

function DeleteSubscription(uri, cnt) {
    const method = "DELETE";
    const requestId = Math.floor(Math.random() * 10000);
    const url = 'http://' + drone_info.host + ":7579/" + uri + "/" + cnt + "/" + sub_rn;

    const options = {
        url: url,
        method: method,
        headers: {
            "Accept": "application/json",
            "X-M2M-Origin": 'S' + drone_info.id,
            "X-M2M-RI": requestId,
        }
    };
    // console.log("\n[REQUEST]\n", options);

    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
        } else {
            // console.log("\n[RESPONSE]\n", response.statusCode);
            // console.log(body);
            console.log('Delete Subscription\n  ' + options.url);
            CreateSubscription(uri, cnt);
        }
    });
}

function CreateSubscription(uri, cnt) {
    const method = "POST";
    const url = 'http://' + drone_info.host + ":7579/" + uri + "/" + cnt;
    const resourceType = 23;
    const requestId = Math.floor(Math.random() * 10000);
    const representation = {
        "m2m:sub": {
            "rn": sub_rn,
            "nu": ['http://' + drone_info.host + ':7597/SLX?ct=json'],
            "nct": 2,
            "enc": {
                "net": [1, 2, 3, 4]
            },
            "exc": 0
        }
    };

    const options = {
        url: url,
        method: method,
        headers: {
            "Accept": "application/json",
            "X-M2M-Origin": 'S' + drone_info.id,
            "X-M2M-RI": requestId,
            "Content-Type": "application/json;ty=" + resourceType
        },
        json: representation
    };

    // console.log("\n[REQUEST]\n", options);
    request(options, function (error, response, body) {
        if (error) {
            console.log(error);
        } else {
            // console.log("\n[RESPONSE]\n", response.statusCode);
            console.log('Create Subscription\n  ' + options.url);

            if (response.statusCode === 409) {
                DeleteSubscription(uri, cnt);
            }

            if (cnt === 'Captured_GPS') {
                cnt = 'Geotagged_GPS';
                DeleteSubscription(uri, cnt);
            } else if (cnt === 'Geotagged_GPS') {
                cnt = 'Send_Status';
                DeleteSubscription(uri, cnt);
            }
        }
    });
}

let msw_mqtt_client = null;

msw_mqtt_connect(drone_info.host, 1883);

function msw_mqtt_connect(broker_ip, port) {
    if (msw_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'mqttjs_' + config.drone + '_' + config.name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        msw_mqtt_client = mqtt.connect(connectOptions);

        msw_mqtt_client.on('connect', function () {
            console.log('[msw_mqtt_connect] connected to ' + broker_ip);
            let noti_topic = util.format('/oneM2M/req/+/S%s/#', drone_info.id);
            msw_mqtt_client.subscribe(noti_topic, function () {
                console.log('[msw_mqtt_connect] noti_topic is subscribed:  ' + noti_topic);
            });
        });

        msw_mqtt_client.on('message', function (topic, message) {
            if (msw_sub_mobius_topic.includes(topic)) {
                setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic, message.toString());
            } else {
                if (topic.includes('/oneM2M/req/')) {
                    let jsonObj = JSON.parse(message.toString());

                    let patharr = jsonObj.pc['m2m:sgn'].sur.split('/');
                    let lib_ctl_topic = '/MUV/control/' + patharr[patharr.length - 3].replace('msw_', 'lib_') + '/' + patharr[patharr.length - 2];

                    if (patharr[patharr.length - 3] === config.name) {
                        if (jsonObj.pc['m2m:sgn'].nev) {
                            if (jsonObj.pc['m2m:sgn'].nev.rep) {
                                if (jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']) {
                                    let cinObj = jsonObj.pc['m2m:sgn'].nev.rep['m2m:cin']
                                    if (getType(cinObj.con) == 'string') {
                                        local_msw_mqtt_client.publish(lib_ctl_topic, cinObj.con);
                                    } else {
                                        local_msw_mqtt_client.publish(lib_ctl_topic, JSON.stringify(cinObj.con));
                                    }
                                }
                            }
                        }
                    }
                } else {
                }
            }
        });

        msw_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

let local_msw_mqtt_client = null;

local_msw_mqtt_connect('127.0.0.1', 1883);

function local_msw_mqtt_connect(broker_ip, port) {
    if (local_msw_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'local_msw_mqtt_client_mqttjs_' + config.drone + '_' + config.name + '_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        local_msw_mqtt_client = mqtt.connect(connectOptions);

        local_msw_mqtt_client.on('connect', function () {
            console.log('[local_msw_mqtt_connect] connected to ' + broker_ip);
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    local_msw_mqtt_client.subscribe(msw_sub_fc_topic[idx]);
                    console.log('[local_msw_mqtt] msw_sub_fc_topic[' + idx + ']: ' + msw_sub_fc_topic[idx]);
                }
            }
        });

        local_msw_mqtt_client.on('message', function (topic, message) {
            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_fc_topic[idx]) {
                        setTimeout(on_process_fc_data, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
            for (let idx in msw_sub_lib_topic) {
                if (msw_sub_lib_topic.hasOwnProperty(idx)) {
                    if (topic === msw_sub_lib_topic[idx]) {
                        setTimeout(on_receive_from_lib, parseInt(Math.random() * 5), topic, message.toString());
                        break;
                    }
                }
            }
        });

        local_msw_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message);

    parseControlMission(topic, str_message);
}

function on_receive_from_lib(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');

    parseDataMission(topic, str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');

    let topic_arr = topic.split('/');
    try {
        fc[topic_arr[topic_arr.length - 1]] = JSON.parse(str_message.toString());
    } catch (e) {
    }

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

function parseDataMission(topic, str_message) {
    try {
        // let obj_lib_data = JSON.parse(str_message);
        // if (fc.hasOwnProperty('global_position_int')) {
        //     Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['global_position_int'])));
        // }
        // str_message = JSON.stringify(obj_lib_data);

        let topic_arr = topic.split('/');
        let data_topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1];
        msw_mqtt_client.publish(data_topic, str_message);
        sh_man.crtci(data_topic + '?rcn=0', 0, str_message, null, function (rsc, res_body, parent, socket) {
        });
    } catch (e) {
        console.log('[parseDataMission] data format of lib is not json');
    }
}

function parseControlMission(topic, str_message) {
    try {
        let topic_arr = topic.split('/');
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 1];
        local_msw_mqtt_client.publish(_topic, str_message);
    } catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    let topic_arr = topic.split('/');
    if (topic_arr[topic_arr.length - 1] === 'global_position_int') {
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 1]; // 'global_position_int'
        local_msw_mqtt_client.publish(_topic, str_message);
    } else {
    }
}
