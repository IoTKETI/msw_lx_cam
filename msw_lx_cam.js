/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const mqtt = require('mqtt');
const fs = require('fs');
const spawn = require('child_process').spawn;
const {nanoid} = require('nanoid');
const util = require("util");

let dr_mqtt_client = null;

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
}
catch (e) {
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
}
catch (e) {
    add_lib = {
        name: 'lib_lx_cam',
        target: 'armv7l',
        description: '[name] [server]',
        scripts: "sh lib_lx_cam.sh",
        data: ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS", "Check_USBMem", "init_res"],
        control: ['Capture', 'init_req']
    };
    config.lib.push(add_lib);
}

let msw_sub_relay_topic = [];

let msw_sub_fc_topic = [];
msw_sub_fc_topic.push('/od/tele/broadcast/man/gpi/orig');

let msw_sub_lib_topic = [];

function init() {
    if (config.lib.length > 0) {
        for (let idx in config.lib) {
            if (config.lib.hasOwnProperty(idx)) {
                for (let i = 0; i < config.lib[idx].data.length; i++) {
                    let container_name = config.lib[idx].data[i];
                    let _topic = '/MUV/data/' + config.lib[idx].name + '/' + container_name;
                    msw_sub_lib_topic.push(_topic);
                }

                for (let i = 0; i < config.lib[idx].control.length; i++) {
                    let sub_container_name = config.lib[idx].control[i];
                    let _topic = '/Mobius/' + config.gcs + '/Mission_Data/' + config.drone + '/' + config.name + '/' + sub_container_name;
                    msw_sub_relay_topic.push(_topic + '/orig');
                }

                dr_mqtt_connect('127.0.0.1');

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

        }
        else {
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
    }
    catch (e) {
        console.log(e.message);
    }
}

function dr_mqtt_connect(broker_ip) {
    if (!dr_mqtt_client) {
        let connectOptions = {
            host: broker_ip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: config.name + '_' + nanoid(15),
            protocolId: "MQTT",
            protocolVersion: 4,
            clean: true,
            reconnectPeriod: 2 * 1000,
            connectTimeout: 30 * 1000,
            queueQoSZero: false,
            rejectUnauthorized: false
        };

        dr_mqtt_client = mqtt.connect(connectOptions);

        dr_mqtt_client.on('connect', () => {
            console.log('dr_mqtt_client is connected to ( ' + broker_ip + ' )');

            for (let idx in msw_sub_lib_topic) {
                if (msw_sub_lib_topic.hasOwnProperty(idx)) {
                    dr_mqtt_client.subscribe(msw_sub_lib_topic[idx], () => {
                        console.log('[dr_mqtt_client] msw_sub_lib_topic[ ' + idx + ' ] is subscribed: ' + msw_sub_lib_topic[idx]);
                    });
                }
            }
            for (let idx in msw_sub_relay_topic) {
                if (msw_sub_relay_topic.hasOwnProperty(idx)) {
                    dr_mqtt_client.subscribe(msw_sub_relay_topic[idx], () => {
                        console.log('[dr_mqtt_client] msw_sub_relay_topic[ ' + idx + ' ] is subscribed: ' + msw_sub_relay_topic[idx]);
                    });
                }
            }

            for (let idx in msw_sub_fc_topic) {
                if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                    dr_mqtt_client.subscribe(msw_sub_fc_topic[idx], () => {
                        console.log('[dr_mqtt_client] msw_sub_fc_topic[ ' + idx + ' ] is subscribed: ' + msw_sub_fc_topic[idx]);
                    });
                }
            }
        });

        dr_mqtt_client.on('message', (topic, message) => {
            if (msw_sub_relay_topic.includes(topic)) {
                for (let idx in msw_sub_relay_topic) {
                    if (msw_sub_relay_topic.hasOwnProperty(idx)) {
                        if (topic === msw_sub_relay_topic[idx]) {
                            setTimeout(on_receive_from_muv, parseInt(Math.random() * 5), topic, message.toString());
                            break;
                        }
                    }
                }
            }
            else if (msw_sub_lib_topic.includes(topic)) {
                for (let idx in msw_sub_lib_topic) {
                    if (msw_sub_lib_topic.hasOwnProperty(idx)) {
                        if (topic === msw_sub_lib_topic[idx]) {
                            setTimeout(on_receive_from_lib, parseInt(Math.random() * 5), topic, message.toString());
                            break;
                        }
                    }
                }
            }
            else if (msw_sub_fc_topic.includes(topic)) {
                for (let idx in msw_sub_fc_topic) {
                    if (msw_sub_fc_topic.hasOwnProperty(idx)) {
                        if (topic === msw_sub_fc_topic[idx]) {
                            setTimeout(on_process_fc_data, parseInt(Math.random() * 5), topic, message.toString());
                            break;
                        }
                    }
                }
            }
        });

        dr_mqtt_client.on('error', (err) => {
            console.log(err.message);
        });
    }
}

let t_id = null;
let disconnected = true;
let MissionControl = {};

function on_receive_from_muv(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');
    let topic_arr = topic.split('/');

    if (topic_arr[5] === config.name) {
        let recv_sequence;

        if (getType(str_message) === 'string') {
            recv_sequence = parseInt(str_message.substring(0, 2), 16);
            str_message = str_message.substring(2, str_message.length);
        }
        else {
            str_message = JSON.parse(str_message);
            recv_sequence = str_message.sequence;
            str_message = JSON.stringify(str_message);
        }
        MissionControl[recv_sequence] = str_message;
        console.log('[' + topic + '] ' + str_message);

        parseControlMission(topic, str_message);
    }
}

let sequence = 0;

function on_receive_from_lib(topic, str_message) {
    console.log('[' + topic + '] ' + str_message + '\n');

    let seq_str_message;
    if (getType(str_message) === 'string') {
        seq_str_message = (sequence.toString(16).padStart(2, '0')) + str_message;
    }
    else {
        seq_str_message = JSON.parse(str_message);
        seq_str_message.sequence = sequence;
        seq_str_message = JSON.stringify(seq_str_message);
    }

    sequence++;
    sequence %= 255;

    parseDataMission(topic, str_message, seq_str_message);
}

function on_process_fc_data(topic, str_message) {
    // console.log('[' + topic + '] ' + str_message + '\n');
    let topic_arr = topic.split('/');

    try {
        fc[topic_arr[5]] = JSON.parse(str_message.toString());
    }
    catch (e) {
    }

    parseFcData(topic, str_message);
}

setTimeout(init, 1000);

function parseDataMission(topic, str_message, seq_str_message) {
    try {
        // let obj_lib_data = JSON.parse(str_message);
        // if (fc.hasOwnProperty('global_position_int')) {
        //     Object.assign(obj_lib_data, JSON.parse(JSON.stringify(fc['global_position_int'])));
        // }
        // str_message = JSON.stringify(obj_lib_data);
        let topic_arr = topic.split('/');

        let data_topic = '/Mobius/' + drone_info.gcs + '/Mission_Data/' + drone_info.drone + '/' + config.name + '/' + topic_arr[topic_arr.length - 1] + '/orig';
        if (dr_mqtt_client) {
            dr_mqtt_client.publish(data_topic, str_message);
        }
    }
    catch (e) {
        console.log('[parseDataMission] data format of lib is not json');
    }
}

function parseControlMission(topic, str_message) {
    try {
        let topic_arr = topic.split('/');
        let _topic = '/MUV/control/' + config.lib[0].name + '/' + topic_arr[topic_arr.length - 2];
        dr_mqtt_client.publish(_topic, str_message, () => {
            console.log(_topic, str_message)
        });
    }
    catch (e) {
        console.log('[parseControlMission] data format of lib is not json');
    }
}

function parseFcData(topic, str_message) {
    let topic_arr = topic.split('/');
    if (topic_arr[5] === 'gpi') {
        let _topic = '/MUV/tele/' + config.lib[0].name + '/' + topic_arr[5]; // 'global_position_int'
        if (dr_mqtt_client) {
            dr_mqtt_client.publish(_topic, str_message);
        }
    }
}

const getType = function (p) {
    var type = 'string';
    if (Array.isArray(p)) {
        type = 'array';
    }
    else if (typeof p === 'string') {
        try {
            var _p = JSON.parse(p);
            if (typeof _p === 'object') {
                type = 'string_object';
            }
            else {
                type = 'string';
            }
        }
        catch (e) {
            type = 'string';
            return type;
        }
    }
    else if (p != null && typeof p === 'object') {
        type = 'object';
    }
    else {
        type = 'other';
    }

    return type;
};
