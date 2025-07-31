<!-- How to run the app -->

url is a variable and it points out to a place where the backend is deployed e.g transport.masetawosha.com +251983222221 is super admins phone number

1. first run url/api/admin/createTable to create tables. on this time it will create tables and insert data of supper admin and system
2. run url/api/user/loginUser/+251983222221/6/1 to acess login and you will recive sms otp
3. run url/api/user/verifyUserByOTP?OTP=101010&phoneNumber=%2B251983222221&roleId=6 this will check phone number and otp . it will gives you token so save and use this token
4. run url/api/admin/installPreDefinedData it will install all required data like status rore requirements and so on
5. supper admin can give privilage to admin or create any user
