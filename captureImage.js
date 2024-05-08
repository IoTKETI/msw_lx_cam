/**
 * Created by Wonseok Jung in KETI on 2022-02-08.
 */

const {nanoid} = require("nanoid");
const mqtt = require("mqtt");
const fs = require('fs');
const {spawn, exec} = require("child_process");
// const db = require('node-localdb');

// let gps_filename = db('./gps_filename.json');

const my_lib_name = 'lib_lx_cam';

let lib = {};

let dr_mqtt_client = null;
let control_topic = '';
let req_topic = '';
let res_topic = '';
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
let camera_model_name = '';

init();

function init() {
    try {
        lib = {};
        lib = JSON.parse(fs.readFileSync('./' + my_lib_name + '.json', 'utf8'));
    }
    catch (e) {
        lib = {};
        lib.name = my_lib_name;
        lib.target = 'armv7l';
        lib.description = "[name]";
        lib.scripts = "./lib_lx_cam.js";
        lib.data = ["Capture_Status", "Geotag_Status", "Send_Status", "Captured_GPS", "Geotagged_GPS", "Check_USBMem", "init_res"];
        lib.control = ['Capture', 'init_req'];
    }

    control_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][0];
    req_topic = '/MUV/control/' + lib["name"] + '/' + lib["control"][1];

    res_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][6];
    my_status_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][0];
    captured_position_topic = '/MUV/data/' + lib["name"] + '/' + lib["data"][3];

    gpi_topic = '/MUV/tele/' + lib.name + '/gpi';

    dr_mqtt_connect('127.0.0.1');

    const checkCamera = () => {
        let camera_test = spawn("gphoto2", ["--summary"]);
        console.log('Get camera summary to check connection');

        camera_test.stdout.on('data', (data) => {
            if (data.toString().includes('For debugging messages, ')) {
                console.log('[checkCamera] stdout: ' + data);
                status = 'Error';
                let msg = status + ' - Reconnect the camera cable.';
                dr_mqtt_client.publish(my_status_topic, msg);
            }
            else if (data.toString().includes('Camera summary:')) {
                let summary = data.toString().split('\n');
                camera_model_name = summary[2].substring(7, summary.length - 2);
                console.log('[checkCamera] Connected with ' + camera_model_name);
            }
        });
        camera_test.stderr.on('data', (data) => {
            if (data.includes('gphoto2: not found')) {
                console.log('Please install gphoto library');
                status = 'Error';
                let msg = status + ' - Please install gphoto library';
                dr_mqtt_client.publish(my_status_topic, msg);

                setTimeout(install_gphoto, 100);

                process.kill(camera_test.pid, 'SIGINT');
            }
            else if (data.includes('PTP Timeout') || data.toString().includes('PTP I/O Error') || data.toString().includes('An error occurred in the io-library')) {
                status = 'Error';
                let msg = status + ' - Reconnect the camera cable.';
                dr_mqtt_client.publish(my_status_topic, msg);
                process.kill(camera_test.pid, 'SIGINT');
            }
            else if (data.includes('*** Error: No camera found. ***')) {
                status = 'Error';
                let msg = status + ' - Check the camera power.';
                dr_mqtt_client.publish(my_status_topic, msg);
                process.kill(camera_test.pid, 'SIGINT');
            }
            else if (data.includes('Could not claim the USB device')) {
                status = 'Error';
                let msg = status + ' - Check the camera power.';
                dr_mqtt_client.publish(my_status_topic, msg);
                process.kill(camera_test.pid, 'SIGINT');
            }
            else {
                console.log('[checkCamera] stderr: ' + data);
            }
        });
        camera_test.on('exit', (code) => {
            if (code === 0) {
                status = 'Ready';
                dr_mqtt_client.publish(my_status_topic, status);
            }
            else if (code === 1 || code === null) {
                console.log('[checkCamera] exit: ' + code);
                setTimeout(checkCamera, 1000);
            }
        });
        camera_test.on('error', (code) => {
            if (code.toString().includes('gphoto2 ENOENT')) {
                console.log('Please install gphoto library');
                status = 'Error';
                let msg = status + ' - Please install gphoto library';
                dr_mqtt_client.publish(my_status_topic, msg);

                setTimeout(install_gphoto, 100);
            }
            else {
                console.log('[checkCamera] error: ' + code);
            }
        });
    }
    checkCamera();
}

function dr_mqtt_connect(broker_ip, fc, control) {
    if (!dr_mqtt_client) {
        let connectOptions = {
            host: broker_ip,
            port: 1883,
            protocol: "mqtt",
            keepalive: 10,
            clientId: 'captureImage_' + my_lib_name + '_' + nanoid(15),
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

            dr_mqtt_client.publish(my_status_topic, status);

            if (gpi_topic !== '') {
                dr_mqtt_client.subscribe(gpi_topic, () => {
                    console.log('[dr_mqtt_client] gpi_topic: ' + gpi_topic);
                });
            }
            if (control_topic !== '') {
                dr_mqtt_client.subscribe(control_topic, () => {
                    console.log('[dr_mqtt_client] control_topic: ' + control_topic);
                });
            }
            if (req_topic !== '') {
                dr_mqtt_client.subscribe(req_topic, () => {
                    console.log('[dr_mqtt_client] req_topic: ' + req_topic);
                });
            }
        });

        dr_mqtt_client.on('message', (topic, message) => {
            let topic_arr = topic.split('/');
            topic_arr.pop();
            let _topic = topic_arr.join('/');

            if (topic === gpi_topic) {
                gpi_data = JSON.parse(message.toString());
                // console.log(gpi_data);
            }
            else if (topic === control_topic) {
                if (message.toString().includes('g')) {
                    console.log('[Capture command] - ' + message.toString());
                    let command_arr = message.toString().split(' ');
                    interval = command_arr[1];
                    mission = command_arr[2];

                    count = 0;

                    if (status === 'Ready') {
                        capture_flag = true;
                    }
                    else {
                        status = 'Check camera..';
                        dr_mqtt_client.publish(my_status_topic, status);
                    }
                }
                else if (message.toString() === 's') {
                    status = 'Stop';
                    dr_mqtt_client.publish(my_status_topic, status);

                    capture_flag = false;

                    if (capture_command !== null) {
                        process.kill(capture_command.pid, 'SIGINT');
                    }
                }
            }
            else if (topic === req_topic) {
                dr_mqtt_client.publish(res_topic, camera_model_name);
            }
        });

        dr_mqtt_client.on('error', (err) => {
            console.log(err.message);
        });
    }
}

function capture_image() {
    // console.time('capture');
    // gphoto2 --capture-image-and-download --filename 20%y-%m-%dT%H:%M:%S.jpg --interval 3 --folder ./
    capture_command = spawn("gphoto2", ['--capture-image-and-download', '--filename', '20%y-%m-%dT%H_%M_%S.jpg', '--interval', interval, '--folder', './']);

    capture_command.stdout.on('data', (data) => {
        // console.log('data: ' + data);

        // console.timeEnd('capture');
        if (data.toString().split('\n')[1].includes('.jpg')) {
            let data_arr = data.toString().split('\n')[1].split(' ')
            for (let idx in data_arr) {
                if (data_arr[idx].includes('.jpg')) {
                    gpi_data.image = data_arr[idx];

                    // gps_filename.insert(gpi_data);
                    if (gpi_data.hasOwnProperty('_id')) {
                        delete gpi_data['_id'];
                    }
                    console.log('captured -->', data_arr[idx])
                    dr_mqtt_client.publish(captured_position_topic, JSON.stringify(gpi_data));
                    break;
                }
            }
            status = 'Capture';
            count++;
            let msg = status + ' ' + count;
            dr_mqtt_client.publish(my_status_topic, msg);
        }
        // console.time('capture');
    });
    capture_command.stderr.on('data', (data) => {
        if (data.toString().includes("Operation cancelled.")) {
            status = 'Ready';
            dr_mqtt_client.publish(my_status_topic, status);
            console.log('[capture_command] Operation cancelled.');
        }
        else if (data.toString().includes('PTP Cancel Request') || data.toString().includes('PTP General')) {
            status = 'Ready';
            dr_mqtt_client.publish(my_status_topic, status);
            console.log('[capture_command] Cancelled.');
        }
        else if (data.toString().includes('You need to specify a folder starting with')) {
            status = 'Error';
            let msg = status + ' - Board Memory Full';
            dr_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
        }
        else if (data.toString().includes('PTP I/O Error') || data.toString().includes('An error occurred in the io-library') || data.toString().includes('Could not claim the USB device')) {
            status = 'Error';
            let msg = status + ' - Reconnect to Camera';
            dr_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
            setTimeout(capture_image, 1000);
        }
        else {
            console.log('[capture_command] stderr: ' + data);
            status = 'Error';
            let msg = status + ' - stderr: ' + data;
            dr_mqtt_client.publish(my_status_topic, msg);
            process.kill(capture_command.pid, 'SIGINT');
            setTimeout(capture_image, 1000);
        }
        // PTP I/O Error
        // PTP Timeout
    });

    capture_command.on('exit', (code) => {
        console.log(count, '[capture_command] exit: ' + code);

        // console.timeEnd('capture');
        if (code === null) {
            status = 'Ready';
            dr_mqtt_client.publish(my_status_topic, status);
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
