/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const fs = require('fs');
const {spawn, exec} = require("child_process");
const db = require('node-localdb');

let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let lib = {};

let lib_mqtt_client = null;
let control_topic = '';
let my_status_topic = '';
let captured_position_topic = '';
let gpi_topic = '';
let gpi_data = {};

let capture_command = null;
let interval = 5;
let mission = '';

let capture_flag = false;
let count = 0;

let status = 'Init';

init();

function init() {
    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    } catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = "./lib_lx_cam.js";
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS"];
        lib.control = ['Capture'];
    }

    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];
    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][0];
    captured_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][3];
    gpi_topic = '/TELE/drone/gpi';

    lib_mqtt_connect('localhost', 1883, gpi_topic, control_topic);

    const checkCamera = () => {
        let camera_test = spawn("gphoto2", ["--summary"]);
        console.log('Get camera summary to check connection');

        camera_test.stdout.on('data', (data) => {
            if (data.toString().includes('For debugging messages, ')) {
                console.log('[checkCamera] stdout: ' + data);
            } else if (data.toString().includes('Camera summary:')) {
                let summary = data.toString().split('\n');
                console.log('[checkCamera] Connected with ' + summary[2].substring(7, summary.length - 2));
            }
        });
        camera_test.stderr.on('data', (data) => {
            if (data.includes('gphoto2: not found')) {
                console.log('Please install gphoto library');
                status = 'Error';
                let msg = status + ' - Please install gphoto library';
                lib_mqtt_client.publish(my_status_topic, msg);

                setTimeout(install_gphoto, 100);

                process.kill(camera_test.pid, 'SIGINT');
            } else if (data.includes('PTP Timeout') || data.toString().includes('PTP I/O Error') || data.toString().includes('An error occurred in the io-library')) {
                status = 'Error';
                let msg = status + ' - Reconnect the camera cable.';
                lib_mqtt_client.publish(my_status_topic, msg);
                process.kill(camera_test.pid, 'SIGINT');
            } else if (data.includes('*** Error: No camera found. ***')) {
                status = 'Error';
                let msg = status + ' - Check the camera power.';
                lib_mqtt_client.publish(my_status_topic, msg);
                process.kill(camera_test.pid, 'SIGINT');
            } else {
                console.log('[checkCamera] stderr: ' + data);
            }
        });
        camera_test.on('exit', (code) => {
            if (code === 0) {
                status = 'Ready';
                lib_mqtt_client.publish(my_status_topic, status);
            } else if (code === 1 || code === null) {
                console.log('[checkCamera] exit: ' + code);
                setTimeout(checkCamera, 1000);
            }
        });
        camera_test.on('error', function (code) {
            if (code.toString().includes('gphoto2 ENOENT')) {
                console.log('Please install gphoto library');
                status = 'Error';
                let msg = status + ' - Please install gphoto library';
                lib_mqtt_client.publish(my_status_topic, msg);

                setTimeout(install_gphoto, 100);
            } else {
                console.log('[checkCamera] error: ' + code);
            }
        });
    }
    checkCamera();
}

function lib_mqtt_connect(broker_ip, port, fc, control) {
    if (lib_mqtt_client == null) {
        let connectOptions = {
            host: broker_ip,
            port: port,
            protocol: "mqtt",
            keepalive: 10,
            protocolId: "MQTT",
            protocolVersion: 4,
            clientId: 'lib_mqtt_client_mqttjs_' + my_lib_name + '_' + 'capture_' + nanoid(15),
            clean: true,
            reconnectPeriod: 2000,
            connectTimeout: 2000,
            rejectUnauthorized: false
        };

        lib_mqtt_client = mqtt.connect(connectOptions);

        lib_mqtt_client.on('connect', function () {
            console.log('[capture_lib_mqtt_connect] connected to ' + broker_ip);

            if (fc !== '') {
                lib_mqtt_client.subscribe(gpi_topic, function () {
                    console.log('[capture_lib_mqtt] lib_sub_fc_topic: ' + gpi_topic);
                });
            }
            if (control !== '') {
                lib_mqtt_client.subscribe(control, function () {
                    console.log('[capture_lib_mqtt] lib_sub_control_topic: ' + control);
                });
            }

            lib_mqtt_client.publish(my_status_topic, status);
        });

        lib_mqtt_client.on('message', function (topic, message) {
            if (topic === gpi_topic) {
                gpi_data = JSON.parse(message.toString());
            }
            if (topic === control) {
                if (message.toString().includes('g')) {
                    console.log('[Capture command] - ' + message.toString());
                    let command_arr = message.toString().split(' ');
                    interval = command_arr[1];
                    mission = command_arr[2];

                    count = 0;

                    if (status === 'Ready') {
                        capture_flag = true;
                    } else {
                        status = 'Check camera..';
                        lib_mqtt_client.publish(my_status_topic, status);
                    }
                } else if (message.toString() === 's') {
                    status = 'Stop';
                    lib_mqtt_client.publish(my_status_topic, status);

                    capture_flag = false;

                    if (capture_command !== null) {
                        process.kill(capture_command.pid, 'SIGINT');
                    }
                }
            }
        });

        lib_mqtt_client.on('error', function (err) {
            console.log(err.message);
        });
    }
}

function capture_image() {
    console.time('capture');
    // gphoto2 --capture-image-and-download --filename 20%y-%m-%dT%H:%M:%S.jpg --interval 3 --folder ./
    capture_command = spawn("gphoto2", ['--capture-image-and-download', '--filename', '20%y-%m-%dT%H_%M_%S.jpg', '--interval', interval, '--folder', './']);

    capture_command.stdout.on('data', (data) => {
        // console.log('data: ' + data);

        console.timeEnd('capture');
        if (data.toString().split('\n')[1].includes('.jpg')) {
            let data_arr = data.toString().split('\n')[1].split(' ')
            for (let idx in data_arr) {
                if (data_arr[idx].includes('.jpg')) {
                    gpi_data.image = data_arr[idx];

                    gps_filename.insert(gpi_data);
                    if (gpi_data.hasOwnProperty('_id')) {
                        delete gpi_data['_id'];
                    }
                    lib_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data));
                    break;
                }
            }
            status = 'Capture';
            count++;
            let msg = status + ' ' + count;
            lib_mqtt_client.publish(my_status_topic, msg);
        }
        console.time('capture');
    });

    capture_command.stderr.on('data', (data) => {
        if (data.toString().includes("Operation cancelled.")) {
            status = 'Ready';
            lib_mqtt_client.publish(my_status_topic, status);
            console.log('[capture_command] Operation cancelled.');
        } else if (data.toString().includes('PTP Cancel Request') || data.toString().includes('PTP General')) {
            status = 'Ready';
            lib_mqtt_client.publish(my_status_topic, status);
            console.log('[capture_command] Cancelled.');
        } else if (data.toString().includes('You need to specify a folder starting with')) {
            status = 'Error';
            let msg = status + ' - Board Memory Full';
            lib_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
        } else if (data.toString().includes('PTP I/O Error') || data.toString().includes('An error occurred in the io-library') || data.toString().includes('Could not claim the USB device')) {
            status = 'Error';
            let msg = status + ' - Reconnect to Camera';
            lib_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
            setTimeout(capture_image, 1000);
        } else {
            console.log('[capture_command] stderr: ' + data);
            status = 'Error';
            let msg = status + ' - stderr: ' + data;
            lib_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
            setTimeout(capture_image, 1000);
        }
        // PTP I/O Error
        // PTP Timeout
    });

    capture_command.on('exit', (code) => {
        console.log(count, '[capture_command] exit: ' + code);

        console.timeEnd('capture');
        if (code === null) {
            status = 'Ready';
            lib_mqtt_client.publish(my_status_topic, status);
        }
    });

    capture_command.on('error', (code) => {
        console.log('[capture_command] error: ' + code);
    });
}

const install_gphoto = () => {
    exec('sudo apt-get install -y gphoto2', (error, stdout, stderr) => {
        if (error) {
            console.error(`exec error: ${error}`);
            return;
        }
        console.log(`stdout: ${stdout}`);
        console.error(`stderr: ${stderr}`);
    });
}

setInterval(() => {
    if (status === 'Ready') {
        if (capture_flag) {
            // clearInterval(tid);
            capture_image();

            capture_flag = false;
        }
    }
}, 1000);
