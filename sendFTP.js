/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const fs = require('fs');
const moment = require("moment");
const sendFTP = require("basic-ftp");
const {nanoid} = require("nanoid");
const mqtt = require("mqtt");

const my_lib_name = 'lib_lx_cam';

let mission = '';
let ftp_dir = '';
let drone_name = process.argv[3];

let ftp_client = null;
let ftp_host = 'data.iotocean.org';
let ftp_user = 'lx_ftp';
let ftp_pw = 'lx123';

let geotagging_dir = 'Geotagged';

let lib = {};

let lib_mqtt_client = null;
let my_status_topic = '';
let control_topic = '';

let status = 'Init';
let count = 0;

init();

function init() {
    setTimeout(ftp_connect, 500, ftp_host, ftp_user, ftp_pw, ftp_dir);

    lib = {};
    try {
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = './' + my_lib_name;
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"];
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
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'ftp_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', () => {
            console.log('[ftp_lib_mqtt_connect] connected to ' + broker_ip);

            if (control !== '') {
                lib_mqtt_client.subscribe(control, () => {
                    console.log('[ftp_lib_mqtt] lib_sub_control_topic: ' + control);
                });
            }
            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', (topic, message) => {
            if (topic === control) {
                if (message.toString().includes('g')) {
                    console.log(message)
                    if (status === 'Init' || status === 'Finish') {
                        console.log(message.toString());
                        let command_arr = message.toString().split(' ');
                        mission = command_arr[2];

                        ftp_dir = 'Send-' + moment().format('YYYY-MM-DDTHH') + '-' + mission + '-' + drone_name;

                        if (!ftp_client.closed) {
                            ftp_client.ensureDir("/" + ftp_dir);
                        } else {
                            ftp_client.close();
                            ftp_client = null
                            setTimeout(ftp_connect, 100, ftp_host, ftp_user, ftp_pw, ftp_dir);
                        }

                        !fs.existsSync(ftp_dir) && fs.mkdirSync(ftp_dir);
                        console.log('[ftp_lib_mqtt] Create ( ' + ftp_dir + ' ) directory');

                        count = 0;

                        status = 'Start';
                        let msg = status + ' ' + ftp_dir;
                        lib_mqtt_client.publish(my_status_topic, msg);
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

function ftp_connect(host, user, pw, dir) {
    if (ftp_client === null) {
        ftp_client = new sendFTP.Client(0);
    } else {
        ftp_client.close();
        ftp_client = null;
        setTimeout(ftp_connect, 1000, host, user, pw, dir)
    }

    ftp_client.ftp.verbose = false;

    try {
        ftp_client.access({
            host: host,
            user: user,
            password: pw,
            port: 50023
        }).then(() => {
            if (dir !== '') {
                ftp_client.ensureDir("/" + dir);
                console.log('Connect FTP server to ' + host);
                console.log('Create ( ' + dir + ' ) directory');
            } else {
                console.log('Connect FTP server to ' + host);
            }

            // 이전에 전송하지 못한 사진이 남아 있는지 확인
            fs.readdir('./' + geotagging_dir + '/', (err, files) => {
                if (err) {
                    console.log(err);
                } else {
                    if (dir !== '') {
                        if (files.length > 0) {
                            console.log('FTP directory is ' + dir);
                            status = 'Start';
                            let msg = status + ' ' + dir;
                            lib_mqtt_client.publish(my_status_topic, msg);
                        } else {
                            console.log('Geotagged directory is empty');
                        }
                    }
                }
            });
        }).catch((err) => {
            console.log('Access to FTP Server ( ' + host + ' ) failed\n' + err)
            ftp_client.close();
            ftp_client = null;
            console.log('FTP connection retry');
            setTimeout(ftp_connect, 1000, host, user, pw, dir)
        })
    } catch (err) {
        console.log('[FTP] Error\n', err)
        console.log('FTP access failed');
        ftp_client.close();
        ftp_client = null;
        console.log('FTP connection retry');
        setTimeout(ftp_connect, 1000, host, user, pw, dir)
    }
}

let empty_count = 0;

function send_image_via_ftp() {
    try {
        fs.readdir('./' + geotagging_dir + '/', (err, files) => {
            if (err) {
                console.log(err);
                setTimeout(send_image_via_ftp, 50);
                return
            } else {
                if (files.length > 0) {
                    console.time('FTP-' + files[0]);
                    if (!ftp_client.closed) {
                        ftp_client.uploadFrom('./' + geotagging_dir + '/' + files[0], "/" + ftp_dir + '/' + files[0])
                            .then(() => {
                                console.timeEnd('FTP-' + files[0]);
                                console.time('Move-' + files[0]);
                                move_image('./' + geotagging_dir + '/', './' + ftp_dir + '/', files[0])
                                    .then((result) => {
                                        if (result === 'finish') {
                                            count++;

                                            empty_count = 0;
                                            let msg = status + ' ' + count + ' ' + files[0];
                                            lib_mqtt_client.publish(my_status_topic, msg);
                                            console.timeEnd('Move-' + files[0]);

                                            setTimeout(send_image_via_ftp, 100);
                                            return
                                        } else {
                                            setTimeout(send_image_via_ftp, 100);
                                            return
                                        }
                                    })
                                    .catch((err) => {
                                        console.log(err);
                                        fs.stat('./' + ftp_dir + '/' + files[0], (err) => {
                                            console.log(err);
                                            if (err !== null && err.code === "ENOENT") {
                                                console.log("[sendFTP]사진이 존재하지 않습니다.");
                                            }
                                            console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + files[0] + ") 입니다.");
                                        });
                                        console.timeEnd('Move-' + files[0]);
                                        setTimeout(send_image_via_ftp, 100);
                                        return
                                    });
                            })
                            .catch(err => {
                                console.log('[sendFTP] Upload Error -', err);

                                setTimeout(send_image_via_ftp, 100);
                                return
                            })
                    } else {
                        ftp_client.close();
                        ftp_client = null

                        setTimeout(ftp_connect, 100, ftp_host, ftp_user, ftp_pw, ftp_dir);
                        return
                    }
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
                            setTimeout(send_image_via_ftp, 100);
                            return
                        }
                    } else {
                        setTimeout(send_image_via_ftp, 100);
                        return
                    }
                }
            }
        });
    } catch (e) {
        setTimeout(send_image_via_ftp, 100);
        return
    }
}

setInterval(() => {
    // 환경이 구성 되었다. 이제부터 시작한다.
    if (status === 'Start') {
        status = 'Started';

        send_image_via_ftp();
    }
}, 1000);

const move_image = ((from, to, image) => {
    return new Promise((resolve, reject) => {
        // try {
        //     // fs.renameSync(from + image, to + image);
        //     fs.copyFile(from + image, to + image, (err) => {
        //         fs.unlink(from + image, (err) => {
        //         });
        //     });
        // } catch (e) {
        //     console.log(e);
        //     fs.stat(to + image, (err) => {
        //         console.log(err);
        //         if (err !== null && err.code === "ENOENT") {
        //             console.log("[sendFTP]사진이 존재하지 않습니다.");
        //         }
        //         console.log("[sendFTP]이미 처리 후 옮겨진 사진 (" + image + ") 입니다.");
        //     });
        // }
        try {
            fs.copyFile(from + image, to + image, (err) => {
                fs.unlink(from + image, (err) => {
                });
            });
            resolve('finish');
        } catch (e) {
            reject('no such file');
        }
    });
});

// const checkUSB = new Promise((resolve, reject) => {
//     // 외장 메모리 존재 여부 확인
//     fs.readdirSync(external_memory, {withFileTypes: true}).forEach(p => {
//         let dir = p.name;
//         if (p.isDirectory()) {
//             external_memory += dir;
//             console.log('외장 메모리 경로 : ' + external_memory);
//         }
//     });
//     resolve('finish');
// });
//
// function copy2USB(source, destination) {
//     try {
//         if (!fs.existsSync(destination)) {
//             fs.mkdirSync(destination);
//             console.log('Create directory ---> ' + destination);
//         }
//     } catch (e) {
//         if (e.includes('permission denied')) {
//             console.log(e);
//         }
//     }
//
//     status = 'Copying';
//     lib_mqtt_client.publish(my_status_topic, status);
//     console.log('Copy from [ ' + source + ' ] to [ ' + destination + ' ]');
//
//     fsextra.copy(source, destination, function (err) {
//         if (err) {
//             console.log(err);
//         }
//         status = 'Finish';
//         lib_mqtt_client.publish(my_status_topic, status);
//         console.log('Finish copy => from [ ' + source + ' ] to [ ' + destination + ' ]');
//     });
// }
