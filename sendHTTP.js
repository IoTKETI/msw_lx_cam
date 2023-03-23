/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
require("moment-timezone");
const moment = require('moment')
moment.tz.setDefault("Asia/Seoul");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const FormData = require('form-data');
const axios = require('axios');

const my_lib_name = 'lib_lx_cam';

const lxactoken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6ImRyb25lX2lkIiwibmFtZSI6ImRyb25lX25hbWUiLCJjb21wYW55IjoiU1lOQ1RFQ0hOTyIsInBob25lIjoiIiwiaWF0IjoxNjcxMDgyNjgwLCJleHAiOjE5ODY0NDI2ODAsImlzcyI6IlNZTkNURUNITk8iLCJzdWIiOiJBQ0NFU1MifQ.zFDGS8P_0GscV-m7b5Bp-cMuiPEF7cMOdv1GDbYJWms';

let mission = '';
let drone_name = process.argv[3];
let host = process.argv[2];

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Init';
let count = 0;

init();

function init() {
    // 지오태깅 후 전송하지 못한 잔여 사진 삭제
    fs.readdir('./' + geotagging_dir + '/', (err, files) => {
        if (err) {
            console.log(err);
            setTimeout(init, 50);
            return
        } else {
            if (files.length > 0) {
                files.forEach((file) => {
                    fs.rmSync('./' + geotagging_dir + '/' + file);
                });
            }
        }
    });

    lib = {};
    try {
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = './' + my_lib_name;
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS", "Check_USBMem"];
        lib.control = ['Capture'];

        fs.writeFileSync('./' + my_lib_name + '.json', JSON.stringify(lib, null, 4), 'utf8');
    }

    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][2];
    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];

    lib_mqtt_connect('127.0.0.1', 1883, control_topic);
}

function lib_mqtt_connect(broker_ip, port, control) {
    if (lib_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'send' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', () => {
            console.log('[send_lib_mqtt_connect] connected to ' + broker_ip);

            if (control !== '') {
                lib_mqtt_client.subscribe(control, () => {
                    console.log('[send_lib_mqtt] lib_sub_control_topic: ' + control);
                });
            }
            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', (topic, message) => {
            if (topic === control) {
                if (message.toString().includes('g')) {
                    if (status === 'Init' || status === 'Finish') {
                        console.log(message.toString());
                        let command_arr = message.toString().split(' ');
                        mission = command_arr[2];

                        count = 0;

                        status = 'Start';
                        lib_mqtt_client.publish(my_status_topic, status);
                    }
                }
            } else {
                console.log('From ' + topic + 'message is ' + message.toString());
            }
        });

        lib_mqtt_client.on('error', (err) => {
            console.log(err.message);
            lib_mqtt_client = null
            lib_mqtt_connect(broker_ip, port, control)
        });
    }
}

let empty_count = 0;

function send_image() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
                setTimeout(send_image, 50);
                return
            } else {
                if (files.length > 0) {
                    console.log('Find first image - ' + files[0]);
                    console.time('Send-' + files[0]);

                    let ImageStream = fs.createReadStream('./' + geotagging_dir + '/' + files[0]);
                    const formData = new FormData();
                    formData.append('droneName', drone_name);
                    formData.append('imageid', files[0]);
                    formData.append('photo', ImageStream);

                    const config = {
                        headers: {
                            'Content-Type': 'multipart/form-data',
                            'lxactoken': lxactoken
                        },
                        onUploadProgress: function (progressEvent) {
                            var percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                            console.log('percentCompleted', percentCompleted);
                        }
                    };

                    axios.post('http://' + host + ':7560/photo', formData, config)
                        .then(function (response) {
                            console.timeEnd('Send-' + files[0]);
                            console.log('status code', response.status);
                            if (response.status === 200) {
                                // 전송 완료 시 삭제 후 다음 사진
                                count++;

                                empty_count = 0;
                                let msg = status + ' ' + count + ' ' + files[0];
                                lib_mqtt_client.publish(my_status_topic, msg);

                                fs.rmSync('./' + geotagging_dir + '/' + files[0]);

                                console.timeEnd('Send-' + files[0]);

                                setTimeout(send_image, 100);
                                return
                            } else {
                                console.timeEnd('Send-' + files[0]);

                                console.log('status code:', response.status, 'response message: ' + JSON.stringify(response.data));

                                // 전송 실패 시 현재 사진 계속 전송 시도
                                setTimeout(send_image, 100);
                                return
                            }
                        })
                        .catch(function (error) {
                            console.timeEnd('Send-' + files[0]);

                            console.log('response: ' + JSON.stringify(error.response));
                            // 전송 실패 시 현재 사진 계속 전송 시도
                            setTimeout(send_image, 100);
                            return
                        });
                } else {
                    if (status === 'Started') {
                        empty_count++;
                        console.log('Waiting - ' + empty_count);
                        if (empty_count > 200) {
                            status = 'Finish';
                            empty_count = 0;
                            let msg = status + ' ' + count;
                            lib_mqtt_client.publish(my_status_topic, msg);
                        } else {
                            setTimeout(send_image, 100);
                            return
                        }
                    } else {
                        setTimeout(send_image, 100);
                        return
                    }
                    console.timeEnd('Send-' + files[0]);
                }
            }
        });
    } catch (e) {
        console.log(e)
        setTimeout(send_image, 100);
        return
    }
}

setInterval(() => {
    // 환경이 구성 되었다. 이제부터 시작한다.
    if (status === 'Start') {
        status = 'Started';

        send_image();
    }
}, 1000);
