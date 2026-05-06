import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendOTPEmail = async (toEmail, otp, fullName) => {
  await transporter.sendMail({
    from: `"Chitchatz" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: "Your Chitchatz Password Reset OTP",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #f9fafb; border-radius: 12px;">
        <h2 style="color: #1a1a2e; margin-bottom: 8px;">Hi ${fullName},</h2>
        <p style="color: #4b5563; margin-bottom: 24px;">You requested a password reset for your Chitchatz account.</p>
        <div style="background: #1a1a2e; color: #fff; font-size: 36px; font-weight: bold; letter-spacing: 12px; text-align: center; padding: 24px; border-radius: 8px; margin-bottom: 24px;">
          ${otp}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This OTP expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 16px;">If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  });
};
