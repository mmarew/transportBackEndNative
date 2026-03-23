/**
 * Utility for generating standardized and professional messages for SMS and Email.
 */

// Shared Icon Constants (CIDs for email, relative paths for browser view)
const WHATSAPP_ICON = "cid:whatsapp_icon";
const TELEGRAM_ICON = "cid:telegram_icon";
const PHONE_ICON = "cid:phone_icon";

const BROWSER_WHATSAPP_ICON = "/Assets/whatsapp_icon.png";
const BROWSER_TELEGRAM_ICON = "/Assets/telegram_icon.png";
const BROWSER_PHONE_ICON = "/Assets/phone_icon.png";



const getOtpMessage = (otp, type = "login") => {
  const brand = process.env.BRAND_NAME || "Dynamics Transport";
  const action = type === "registration" ? "account registration" : 
                 type === "update" ? "phone number update" : "secure login";
  const supportPhone = process.env.SUPPORT_PHONE_NUMBER || "+251983222221";
  const supportPhoneClean = supportPhone ? supportPhone.replace(/\+/g, "") : "";
  
  const whatsappLink = `https://wa.me/${supportPhoneClean}`;
  const telegramLink = `https://t.me/${supportPhone}`;
  const phoneLink = `tel:${supportPhone}`;
  
  return {
    sms: `Dear user, your ${brand} code is: ${otp}. For your security, please do not share this with anyone. Sharing this code could give others access to your account and data.`,
    emailSubject: `${otp} is your ${brand} verification code`,
    emailHtml: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 25px;">
          <img src="cid:dynamics_logo" alt="${brand}" style="width: 100px; height: auto; margin-bottom: 5px;" />
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${brand}</h1>
        </div>
        
        <div style="background-color: #f8fbff; padding: 30px 5%; border-radius: 12px; text-align: center; border: 1px solid #edf2f7;">
          <p style="font-size: 16px; color: #4a5568; margin-bottom: 20px;">Use the verification code below for your <strong>${action}</strong>:</p>
          
          <div style="background: #ffffff; border-radius: 8px; border: 2px dashed #cbd5e0; padding: 15px 10px; margin: 15px auto; max-width: 240px;">
            <span style="font-size: 32px; font-weight: 800; letter-spacing: 6px; color: #2b6cb0; user-select: all; -webkit-user-select: all; -moz-user-select: all; -ms-user-select: all;">${otp}</span>
          </div>
          
          <div style="margin-top: 25px; padding: 15px; background-color: #fffaf0; border-left: 4px solid #ed8936; text-align: left;">
            <p style="font-size: 14px; color: #7b341e; margin: 0; line-height: 1.5;">
              <strong>Important Security Note:</strong> Please do not share this code with anyone, including Dynamics Transport staff. Sharing your verification code puts your account at risk of unauthorized access and potential data theft.
            </p>
          </div>
        </div>

        <div style="margin-top: 35px; background-color: #f7fafc; padding: 25px; border-radius: 10px; text-align: center;">
          <p style="font-size: 15px; color: #2d3748; margin-bottom: 10px; font-weight: 600;">We'd love to hear from you!</p>
          <p style="font-size: 14px; color: #4a5568; margin-bottom: 15px; line-height: 1.5;">Have feedback, comments, or a new idea? Contact us directly:</p>
          <div style="margin-bottom: 20px;">
            <a href="${phoneLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${PHONE_ICON}" alt="Phone" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${whatsappLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${WHATSAPP_ICON}" alt="WhatsApp" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${telegramLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${TELEGRAM_ICON}" alt="Telegram" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
          </div>
          <div style="background-color: #e6fffa; color: #234e52; padding: 10px; border-radius: 6px; font-size: 13px;">
            🛡️ <strong>Data Security:</strong> Your privacy is our priority. All your data is encrypted and secured with industry standards.
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; text-align: center;">
          <p style="margin-bottom: 8px;">If you didn't request this code, please ignore this email.</p>
          <p>&copy; 2026 ${brand}. All rights reserved.</p>
        </div>
      </div>
    `
  };
};

const getEmailVerificationLinkMessage = (verificationLink, type = "registration") => {
  const brand = process.env.BRAND_NAME || "Dynamics Transport";
  const supportPhone = process.env.SUPPORT_PHONE_NUMBER || "+251983222221";
  const supportPhoneClean = supportPhone ? supportPhone.replace(/\+/g, "") : "";
  
  const whatsappLink = `https://wa.me/${supportPhoneClean}`;
  const telegramLink = `https://t.me/${supportPhone}`;
  const phoneLink = `tel:${supportPhone}`;
  
  const isUpdate = type === "update";
  const subject = isUpdate ? `Confirm your ${brand} Email Update` : `Verify your ${brand} Email Address`;
  const title = isUpdate ? "Confirm your email update" : "Verify your email address";
  const bodyText = isUpdate 
    ? `You have updated your email address on ${brand}! To secure your account and complete this change, please verify your new email address by clicking the button below.`
    : `Welcome to ${brand}! To complete your registration and secure your account, please verify your email address by clicking the button below.`;

  return {
    emailSubject: subject,
    emailHtml: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 25px;">
          <img src="cid:dynamics_logo" alt="${brand}" style="width: 100px; height: auto; margin-bottom: 5px;" />
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">${brand}</h1>
        </div>
        
        <div style="background-color: #f8fbff; padding: 30px 5%; border-radius: 12px; text-align: center; border: 1px solid #edf2f7;">
          <p style="font-size: 18px; color: #2c3e50; margin-bottom: 10px; font-weight: 700;">${title}</p>
          <p style="font-size: 15px; color: #4a5568; margin-bottom: 25px; line-height: 1.6;">${bodyText}</p>
          
          <a href="${verificationLink}" style="display: inline-block; padding: 14px 30px; background-color: #2b6cb0; color: #ffffff; text-decoration: none; font-weight: bold; border-radius: 8px; font-size: 16px; box-shadow: 0 4px 6px rgba(43, 108, 176, 0.2);">Verify Email Address</a>
          
          <p style="font-size: 13px; color: #718096; margin-top: 25px;">This link will expire in 2 hours. If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="font-size: 12px; color: #2b6cb0; word-break: break-all; margin-top: 5px;">${verificationLink}</p>
        </div>

        <div style="margin-top: 25px; padding: 15px; background-color: #fff5f5; border: 1px solid #fed7d7; border-radius: 8px; text-align: center;">
          <p style="font-size: 14px; color: #c53030; margin: 0;">
            <strong>Not your account?</strong> If you didn't request this email, please <a href="${verificationLink.replace('verify-email', 'report-wrong-email')}" style="color: #c53030; font-weight: bold; text-decoration: underline;">click here to let us know</a>. We will stop further messages to this address.
          </p>
        </div>

        <div style="margin-top: 35px; background-color: #f7fafc; padding: 25px; border-radius: 10px; text-align: center;">
          <p style="font-size: 15px; color: #2d3748; margin-bottom: 15px; font-weight: 600;">Need help? Contact us directly:</p>
          <div style="margin-bottom: 10px;">
            <a href="${phoneLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${PHONE_ICON}" alt="Phone" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${whatsappLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${WHATSAPP_ICON}" alt="WhatsApp" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${telegramLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${TELEGRAM_ICON}" alt="Telegram" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; text-align: center;">
          <p style="margin-bottom: 8px;">If you didn't create an account with ${brand}, please ignore this email.</p>
          <p>&copy; 2026 ${brand}. All rights reserved.</p>
        </div>
      </div>
    `
  };
};

/**
 * Generates an SMS message with a clickable verification link AND a 6-digit OTP.
 * 
 * JUNIOR NOTE: Providing BOTH a link and a manual OTP is best practice. 
 * If the user is already on the login/verification screen, they can just 
 * type the code instead of switching apps to click the link.
 * 
 * @param {string} link - The verification URL.
 * @param {string} otp - The 6-digit manual entry code.
 * @param {string} [type='update'] - The context (registration or update).
 * @returns {Object} Message object.
 */
const getPhoneVerificationLinkMessage = (link, otp, type = "update") => {
  const brandName = process.env.BRAND_NAME || "Dynamics Transport";
  
  return {
    sms: `Welcome to ${brandName}! Please verify your phone number by clicking here: ${link} or use code: ${otp}`,
  };
};

/**
 * Generates recovery-friendly HTML for phone verification success.
 * 
 * JUNIOR NOTE: Since we force a logout on phone change, this page
 * must clearly instruct the user to log in again.
 */
const getSuccessPhoneVerificationHtml = () => {
  const brand = process.env.BRAND_NAME || "Dynamics Transport";
  
  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="margin-bottom: 25px;">
        <h1 style="color: #2b6cb0; margin: 0; font-size: 28px;">${brand}</h1>
      </div>
      
      <div style="background-color: #f0fff4; border: 1px solid #c6f6d5; padding: 30px; border-radius: 10px; margin-bottom: 25px;">
        <div style="font-size: 48px; margin-bottom: 10px;">📱✅</div>
        <h2 style="color: #276749; margin: 0 0 10px 0; font-size: 24px;">Phone Verified!</h2>
        <p style="color: #2f855a; margin: 0; font-size: 16px;">
          Your new phone number has been successfully verified.
        </p>
      </div>

      <p style="color: #4a5568; margin-bottom: 25px; line-height: 1.6; font-size: 16px;">
        For security reasons, you have been logged out. Please <strong>log in again</strong> with your new phone number to continue using ${brand}.
      </p>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 13px; color: #718096;">
        &copy; 2026 ${brand}. All rights reserved.
      </div>
    </div>
  `;
};

const getSuccessEmailVerificationHtml = () => {
  const brand = process.env.BRAND_NAME || "Dynamics Transport";
  const supportPhone = process.env.SUPPORT_PHONE_NUMBER || "+251983222221";
  const supportPhoneClean = supportPhone ? supportPhone.replace(/\+/g, "") : "";
  
  const whatsappLink = `https://wa.me/${supportPhoneClean}`;
  const telegramLink = `https://t.me/${supportPhone}`;
  const phoneLink = `tel:${supportPhone}`;
  
  return `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 40px auto; padding: 30px; border: 1px solid #e0e0e0; border-radius: 12px; background-color: #ffffff; text-align: center; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
      <div style="margin-bottom: 25px;">
        <h1 style="color: #2b6cb0; margin: 0; font-size: 28px;">${brand}</h1>
      </div>
      
      <div style="background-color: #f0fff4; border: 1px solid #c6f6d5; padding: 30px; border-radius: 10px; margin-bottom: 25px;">
        <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
        <h2 style="color: #2f855a; margin: 0 0 10px 0; font-size: 24px;">Email Verified!</h2>
        <p style="color: #276749; margin: 0; font-size: 16px;">Your email address has been successfully verified.</p>
      </div>

      <p style="font-size: 16px; color: #4a5568; margin-bottom: 30px; line-height: 1.6;">
        Thank you for verifying your email. You can now return to the app and enjoy all the features of ${brand}.
      </p>

      <div style="margin-top: 35px; background-color: #f7fafc; padding: 20px; border-radius: 10px; text-align: center;">
        <p style="font-size: 15px; color: #2d3748; margin-bottom: 15px; font-weight: 600;">Need help? Contact us directly:</p>
        <div style="margin-bottom: 10px;">
          <a href="${phoneLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
            <img src="${BROWSER_PHONE_ICON}" alt="Phone" style="width: 32px; height: 32px; vertical-align: middle;" />
          </a>
          <a href="${whatsappLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
            <img src="${BROWSER_WHATSAPP_ICON}" alt="WhatsApp" style="width: 32px; height: 32px; vertical-align: middle;" />
          </a>
          <a href="${telegramLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
            <img src="${BROWSER_TELEGRAM_ICON}" alt="Telegram" style="width: 32px; height: 32px; vertical-align: middle;" />
          </a>
        </div>
      </div>

      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 13px; color: #718096;">
        <p>You can now close this window and proceed in the app.</p>
        <p style="margin-top: 20px;">&copy; 2026 ${brand}. All rights reserved.</p>
      </div>
    </div>
  `;
};

const getAdminAssignmentMessage = (otp, roleName = "Admin") => {
  const brand = process.env.BRAND_NAME || "Dynamics Transport";
  const supportPhone = process.env.SUPPORT_PHONE_NUMBER || "+251983222221";
  const supportPhoneClean = supportPhone ? supportPhone.replace(/\+/g, "") : "";
  
  const whatsappLink = `https://wa.me/${supportPhoneClean}`;
  const telegramLink = `https://t.me/${supportPhone}`;
  const phoneLink = `tel:${supportPhone}`;
  
  return {
    sms: `Welcome! You have been officially assigned as a ${roleName} for ${brand}. Use this secure code to access your administrative dashboard: ${otp}. For your security, never share this code with anyone.`,
    emailSubject: `Welcome to the Team! You've been assigned as a ${roleName} at ${brand}`,
    emailHtml: `
      <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 10px; background-color: #ffffff;">
        <div style="text-align: center; margin-bottom: 25px;">
          <img src="cid:dynamics_logo" alt="${brand}" style="width: 100px; height: auto; margin-bottom: 5px;" />
          <h1 style="color: #2c3e50; margin: 0; font-size: 24px;">Welcome to ${brand}</h1>
        </div>
        
        <div style="background-color: #f8fbff; padding: 30px 5%; border-radius: 12px; text-align: center; border: 1px solid #edf2f7;">
          <p style="font-size: 18px; color: #2d3748; margin-bottom: 15px; font-weight: 700;">Administrative Role Assignment: ${roleName}</p>
          <p style="font-size: 15px; color: #4a5568; margin-bottom: 25px; line-height: 1.6;">
            You have been officially assigned as a <strong>${roleName}</strong> within the ${brand} ecosystem. 
            To activate your administrative access and secure your workspace, please use the unique verification code below:
          </p>
          
          <div style="background: #ffffff; border-radius: 8px; border: 2px dashed #2b6cb0; padding: 20px 10px; margin: 20px auto; max-width: 260px;">
            <span style="font-size: 36px; font-weight: 800; letter-spacing: 8px; color: #2b6cb0;">${otp}</span>
          </div>
          
          <div style="margin-top: 25px; padding: 15px; background-color: #fffaf0; border-left: 4px solid #ed8936; text-align: left;">
            <p style="font-size: 14px; color: #7b341e; margin: 0; line-height: 1.5;">
              <strong>Security Protocol:</strong> Your account now holds administrative privileges. This code is confidential and should never be shared with anyone, including other staff members.
            </p>
          </div>
        </div>

        <div style="margin-top: 35px; background-color: #f7fafc; padding: 25px; border-radius: 10px; text-align: center;">
          <p style="font-size: 15px; color: #2d3748; margin-bottom: 15px; font-weight: 600;">System Support & Feedback</p>
          <div style="margin-bottom: 15px;">
            <a href="${phoneLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${PHONE_ICON}" alt="Phone" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${whatsappLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${WHATSAPP_ICON}" alt="WhatsApp" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
            <a href="${telegramLink}" style="text-decoration: none; margin: 0 10px; display: inline-block;">
              <img src="${TELEGRAM_ICON}" alt="Telegram" style="width: 32px; height: 32px; vertical-align: middle;" />
            </a>
          </div>
        </div>

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #edf2f7; font-size: 12px; color: #a0aec0; text-align: center;">
          <p>&copy; 2026 ${brand} Admin Services. This message contains confidential information.</p>
        </div>
      </div>
    `
  };
};

module.exports = {
  getPhoneVerificationLinkMessage,
  getSuccessPhoneVerificationHtml,
  getSuccessEmailVerificationHtml,
  getEmailVerificationLinkMessage,
  getOtpMessage,
  getAdminAssignmentMessage
};
