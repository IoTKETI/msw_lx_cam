# set FTP server

### FTP 설치 및 설정
1. vsftpd 설치
```shell
sudo apt-get update
sudo apt-get install -y vsftpd
```

2. vsftpd 설정
```shell
sudo nano /etc/vsftpd.conf
```
- 아래의 내용과 같이 수정
```
# Example config file /etc/vsftpd.conf
#
# The default compiled in settings are fairly paranoid. $
# loosens things up a bit, to make the ftp daemon more u$
# Please see vsftpd.conf.5 for all compiled in defaults.
#
# READ THIS: This example file is NOT an exhaustive list$
# Please read the vsftpd.conf.5 manual page to get a ful$
# capabilities.
#
#
# Run standalone?  vsftpd can run either from an inetd o$
# daemon started from an initscript.
listen=YES
listen_port=50023
#
# This directive enables listening on IPv6 sockets. By d$
# on the IPv6 "any" address (::) will accept connections$
# and IPv4 clients. It is not necessary to listen on *bo$
# sockets. If you want that (perhaps because you want to$
# addresses) then you must run two copies of vsftpd with$
# files.
listen_ipv6=NO
#
# Allow anonymous FTP? (Disabled by default).
anonymous_enable=NO
#
# Uncomment this to allow local users to log in.
local_enable=YES
#
# Uncomment this to enable any form of FTP write command.
write_enable=YES
#
# Default umask for local users is 077. You may wish to $
# if your users expect that (022 is used by most other f$
#local_umask=022
#
# Uncomment this to allow the anonymous FTP user to uplo$
# has an effect if the above global write enable is acti$
# obviously need to create a directory writable by the F$
#anon_upload_enable=YES
#
# Uncomment this if you want the anonymous FTP user to b$
# new directories.
#anon_mkdir_write_enable=YES
#
# Activate directory messages - messages given to remote$
# go into a certain directory.
dirmessage_enable=YES
#
# If enabled, vsftpd will display directory listings wit$
# in  your  local  time  zone.  The default is to displa$
# times returned by the MDTM FTP command are also affect$
# option.
use_localtime=YES
#
# Activate logging of uploads/downloads.
xferlog_enable=YES
#
# Make sure PORT transfer connections originate from por$
connect_from_port_20=YES
#
# If you want, you can arrange for uploaded anonymous fi$
# a different user. Note! Using "root" for uploaded file$
# recommended!
#chown_uploads=YES
#chown_username=whoever
#
# You may override where the log file goes if you like. $
# below.
xferlog_file=/var/log/vsftpd.log
#
# Uncomment this to allow the anonymous FTP user to uplo$
# has an effect if the above global write enable is acti$
# obviously need to create a directory writable by the F$
#anon_upload_enable=YES
#
# Uncomment this if you want the anonymous FTP user to b$
# new directories.
#anon_mkdir_write_enable=YES
#
# Activate directory messages - messages given to remote$
# go into a certain directory.
dirmessage_enable=YES
#
# If enabled, vsftpd will display directory listings wit$
# in  your  local  time  zone.  The default is to displa$
# times returned by the MDTM FTP command are also affect$
# option.
use_localtime=YES
#
# Activate logging of uploads/downloads.
xferlog_enable=YES
#
# Make sure PORT transfer connections originate from por$
connect_from_port_20=YES
#
# If you want, you can arrange for uploaded anonymous fi$
# a different user. Note! Using "root" for uploaded file$
# recommended!
#chown_uploads=YES
#chown_username=whoever
#
# You may override where the log file goes if you like. $
# below.
xferlog_file=/var/log/vsftpd.log
#
# If you want, you can have your log file in standard ft$
# Note that the default log file location is /var/log/xf$
#xferlog_std_format=YES
#
# You may change the default value for timing out an idl$
#idle_session_timeout=600
#
# You may change the default value for timing out a data$
#data_connection_timeout=120
#
# It is recommended that you define on your system a uni$
# ftp server can use as a totally isolated and unprivile$
#nopriv_user=ftpsecure
#
# Enable this and the server will recognise asynchronous$
# recommended for security (the code is non-trivial). No$
# however, may confuse older FTP clients.
#async_abor_enable=YES
#
# By default the server will pretend to allow ASCII mode$
# the request. Turn on the below options to have the ser$
# mangling on files when in ASCII mode.
# Beware that on some FTP servers, ASCII support allows $
# attack (DoS) via the command "SIZE /big/file" in ASCII$
# predicted this attack and has always been safe, report$
# raw file.
# ASCII mangling is a horrible feature of the protocol.
#ascii_upload_enable=YES
#ascii_download_enable=YES
#
# You may fully customise the login banner string:
#ftpd_banner=Welcome to blah FTP service.
#
# You may specify a file of disallowed anonymous e-mail $
# useful for combatting certain DoS attacks.
#deny_email_enable=YES
# (default follows)
#banned_email_file=/etc/vsftpd.banned_emails
#
# You may restrict local users to their home directories$
# the possible risks in this before using chroot_local_u$
# chroot_list_enable below.
#chroot_local_user=YES
#
# You may specify an explicit list of local users to chr$
# directory. If chroot_local_user is YES, then this list$
# users to NOT chroot().
# (Warning! chroot'ing can be very dangerous. If using c$
# the user does not have write access to the top level d$
# chroot)
chroot_local_user=YES
chroot_list_enable=YES
# (default follows)
chroot_list_file=/etc/vsftpd.chroot_list
#
# You may activate the "-R" option to the builtin ls. Th$
# default to avoid remote users being able to cause exce$
# sites. However, some broken FTP clients such as "ncftp$
# the presence of the "-R" option, so there is a strong $
#ls_recurse_enable=YES
#
# Customization
#
# Some of vsftpd's settings don't fit the filesystem lay$
# default.
#
# This option should be the name of a directory which is$
# directory should not be writable by the ftp user. This$
# as a secure chroot() jail at times vsftpd does not req$
# access.
secure_chroot_dir=/var/run/vsftpd/empty
#
# This string is the name of the PAM service vsftpd will$
pam_service_name=vsftpd
#
# This option specifies the location of the RSA certific$
# encrypted connections.
rsa_cert_file=/etc/ssl/certs/ssl-cert-snakeoil.pem
rsa_private_key_file=/etc/ssl/private/ssl-cert-snakeoil.$
ssl_enable=NO

#
# Uncomment this to indicate that vsftpd use a utf8 file$
#utf8_filesystem=YES
#seccomp_sandbox=NO
#isolate_network=NO
allow_writeable_chroot=YES
port_enable=NO
pasv_enable=YES
#pasv_min_port=50033
#pasv_max_port=50043
local_max_rate=0
```
- 설정 적용
```shell
sudo service vsftpd restart
```

### FTP용 폴더 설정
1. 폴더 생성
```shell
mkdir ~/ftp
```
2. 권한 수정
```shell
sudo chmod 777 ~/ftp
```

### FTP용 사용자 설정
1. 사용자 추가
```shell
sudo adduser lx_ftp
```
2. 생성한 계정 홈 디렉토리 변경
```shell
sudo nano /etc/passwd
```
- lx_ftp에 해당하는 내용을 수정: /home/keti 뒤에 "/ftp" 추가
```
lx_ftp:x:1001:1001:forLXFTP,,,:/home/keti/ftp:/bin/bash
```
3. 홈 디렉토리 외 다른 디렉토리 사용 제한 제외
```shell
echo "keti" | sudo tee -a /etc/vsftpd.chroot_list
```




