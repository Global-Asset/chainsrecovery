const crypto = require('crypto');
const nodemailer = require('nodemailer');

const COINS = ['BNB', 'BTC', 'ETH', 'MATIC', 'ECE', 'USDT', 'USDC', 'SOL', 'TRX'];

const genOtp = () => String(crypto.randomInt(100000, 999999));
const genWalletAddress = () => '0x' + crypto.randomBytes(20).toString('hex');
const isValidEmail = e => /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(String(e || ''));
const isStrongPassword = p => typeof p === 'string' && p.length >= 8;

let transporter = null;
if (process.env.SMTP_HOST && process.env.SMTP_USER) {
  transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
          port: parseInt(process.env.SMTP_PORT || '587', 10),
              secure: process.env.SMTP_SECURE === 'true',
                  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
                    });
                    }

                    async function sendOtpEmail(email, code, purpose) {
                      if (!transporter) {
                        if (process.env.NODE_ENV === 'production') {
                          throw new Error('Email delivery is not configured');
                        }
                        console.log(`\n📧 [DEV MODE] OTP for ${email} is: ${code}\n`);
                        return false;
                      }
                      await transporter.sendMail({
                        from: process.env.SMTP_FROM || process.env.SMTP_USER,
                        to: email,
                        subject: 'ChainRecover Code',
                        text: `Your ${purpose} code is: ${code}`
                      });
                      return true;
                    }
async function sendTransactionEmail(email, type, amount, coin, otherParty) {
    if (!transporter) {
        console.log(`\n📧 [DEV MODE EMAIL]`);
            console.log(`   To: ${email}`);
                console.log(`   Subject: Wallet Update - Funds ${type}`);
                    console.log(`   Body: You have successfully ${type.toLowerCase()} ${amount} ${coin}. Counterparty: ${otherParty}\n`);
                        return;
                          }
                            try {
                                await transporter.sendMail({
                                      from: process.env.SMTP_FROM || process.env.SMTP_USER,
                                            to: email,
                                                  subject: `ChainRecover — Funds ${type}`,
                                                        text: `You have successfully ${type.toLowerCase()} ${amount} ${coin}. Counterparty Wallet: ${otherParty}`
                                                            });
                                                              } catch (err) { console.error('Email failed:', err); }
                                                              }

                                                              module.exports = { COINS, genOtp, genWalletAddress, isValidEmail, isStrongPassword, sendOtpEmail, sendTransactionEmail };
