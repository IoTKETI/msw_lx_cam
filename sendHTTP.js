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
let host = 'data.iotocean.org';

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Init';
let count = 0;

let prev_dir = [];
let last_prev_dir = '';
let send_dir = '';

init();

function init() {
    !fs.existsSync('./Wastebasket') && fs.mkdirSync('./Wastebasket');
    // !fs.existsSync('./Wastebasket/send') && fs.mkdirSync('./Wastebasket/send');

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

    check_last_dir().then((result) => {
        if (result === 'OK') {
            send_dir = last_prev_dir;
            console.log('[check_last_dir] send_dir -', send_dir);

            status = 'Start';
            let msg = status + ' ' + send_dir;
            lib_mqtt_client.publish(my_status_topic, msg);
        } else {
            console.log('Previous photos do not exist.');
            // TODO: Mobius에 로그 업데이트 여부?
        }
    });
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
            let command = message.toString();
            if (topic === control) {
                if (command.includes('g')) {
                    status = 'Init';
                    if (status === 'Init' || status === 'Started' || status === 'Finish') {
                        console.log(command);
                        let command_arr = command.split(' ');
                        mission = command_arr[2];

                        count = 0;

                        // 지오태깅 후 전송하지 못한 잔여 사진 휴지통으로 임시 이동
                        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
                            if (err) {
                                console.log(err);
                                setTimeout(init, 50);
                                return
                            } else {
                                if (files.length > 0) {
                                    files.forEach((file) => {
                                        // fs.rmSync('./' + geotagging_dir + '/' + file);
                                        // TODO: 명령 수신한 시간 이후 사진 포함 확인
                                        fs.renameSync('./' + geotagging_dir + '/' + file, './Wastebasket/' + file);
                                    });
                                }
                            }
                        });

                        send_dir = 'Send-' + moment().format('YYYY-MM-DDTHH') + '-' + mission + '-' + drone_name;
                        console.log('make directory... (' + send_dir + ')');
                        !fs.existsSync(send_dir) && fs.mkdirSync(send_dir);

                        status = 'Start';
                        let msg = status + ' ' + send_dir;
                        lib_mqtt_client.publish(my_status_topic, msg);
                    }
                }
            } else {
                console.log('From ' + topic + 'message is ' + message.toString());
            }
        });

        lib_mqtt_client.on('error', (err) => {
            console.log(err.message);
            lib_mqtt_client = null;
            lib_mqtt_connect(broker_ip, port, control);
        });
    }
}

let empty_count = 0;
let index = 0;

function send_image() {
    try {
        if (status === 'Started') {
            fs.readdir('./' + geotagging_dir + '/', (err, files) => {
                if (err) {
                    console.log(err);
                    setTimeout(send_image, 50);
                    return
                } else {
                    let image_file = '';
                    if (files.length > 0) {
                        if (files[index] !== undefined) {
                            if (files[index].substring(files[index].length - 4, files[index].length).toLowerCase() === '.jpg') {
                                image_file = files[index];
                            } else {
                                index++;
                                setTimeout(send_image, 50);
                                return
                            }
                        } else {
                            setTimeout(send_image, 50);
                            return
                        }
                        console.log('Find image - ' + image_file);
                        console.time('Send-' + image_file);

                        let ImageStream = fs.createReadStream('./' + geotagging_dir + '/' + image_file);
                        const formData = new FormData();
                        formData.append('droneName', drone_name);
                        formData.append('imageid', image_file);
                        formData.append('photo', ImageStream);

                        const config = {
                            headers: {
                                'Content-Type': 'multipart/form-data',
                                'lxactoken': lxactoken
                            },
                            maxBodyLength: Infinity,
                            maxContentLength: Infinity,
                            onUploadProgress: function (progressEvent) {
                                var percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                                console.log('percentCompleted', percentCompleted);
                            }
                        };

                        axios.post('http://' + host + ':7560/photo', formData, config)
                            .then(function (response) {
                                console.log('status code', response.status);
                                if (response.status === 200) {
                                    // 전송 완료 시 이동 후 다음 사진
                                    count++;

                                    empty_count = 0;
                                    let msg = status + ' ' + count + ' ' + image_file;
                                    lib_mqtt_client.publish(my_status_topic, msg);

                                    // 사진 이동
                                    // fs.rmSync('./' + geotagging_dir + '/' + image_file);
                                    fs.renameSync('./' + geotagging_dir + '/' + image_file, './' + send_dir + '/' + image_file, () => {
                                        console.log('moved image( ' + image_file + ' ) from ' + geotagging_dir + ' to ' + send_dir);
                                        index = 0;
                                    });

                                    console.timeEnd('Send-' + image_file);

                                    setTimeout(send_image, 500);
                                    return
                                } else {
                                    console.timeEnd('Send-' + image_file);

                                    console.log('status code:', response.status, 'response message: ' + JSON.stringify(response.data));

                                    // 전송 실패 시 현재 사진 계속 전송 시도
                                    setTimeout(send_image, 500);
                                    return
                                }
                            })
                            .catch(function (error) {
                                console.timeEnd('Send-' + image_file);
                                if (error.response) {
                                    console.log('response: ', error.response);
                                } else {
                                    console.log('catch -', error)
                                }
                                // 전송 실패 시 현재 사진 계속 전송 시도
                                setTimeout(send_image, 500);
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

                                // Wastebasket에 사진 있으면 Geotagged로 이동해서 전에 못보낸 사진들 전송할 수 있도록 이동
                                // fs.readdir('./Wastebasket/', {withFileTypes: true}, (err, files) => {
                                //     if (err) {
                                //         console.log(err);
                                //         status = "[Error]-can't read Wastebasket directory...";
                                //         lib_mqtt_client.publish(my_status_topic, status);
                                //     } else {
                                //         if (files.length > 0) {
                                //             files.forEach((file) => {
                                //                 if (file.name.substring(file.name.length - 4, file.name.length).toLowerCase() === '.jpg') {
                                //                     fs.renameSync('./Wastebasket/' + file.name, './' + geotagging_dir + '/' + file.name, () => {
                                //                         console.log('moved image( ' + file.name + ' ) from Wastebasket to ' + geotagging_dir);
                                //                     });
                                //                 } else {
                                //                     if (!file.isDirectory()) {
                                //                         fs.rmSync('./Wastebasket/' + file.name, () =>{
                                //                             console.log('Remove ./Wastebasket/' + file.name + '. It is not .jpg');
                                //                         });
                                //                     } else {
                                //                         // file.name이 폴더면 패스
                                //                     }
                                //                 }
                                //             });
                                //         }
                                //     }
                                // });
                                //
                                // send_dir = last_prev_dir;
                                // status = 'Start';
                                // msg = status + ' ' + send_dir;
                                // lib_mqtt_client.publish(my_status_topic, msg);
                            } else {
                                setTimeout(send_image, 100);
                                return
                            }
                        } else {
                            setTimeout(send_image, 100);
                            return
                        }
                    }
                }
            });
        } else {
            // 'Started'가 아닌 상태
        }
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

function check_last_dir() {
    return new Promise((resolve, reject) => {
        try {
            fs.readdirSync('./', {withFileTypes: true}).forEach((p) => {
                const dir = p.name;

                if (dir.includes('Send') && p.isDirectory()) {
                    prev_dir.push(dir);
                    last_prev_dir = prev_dir[prev_dir.length - 1];
                }
            });
            resolve('OK');
        } catch (e) {
            reject('fail');
        }
    });
}
