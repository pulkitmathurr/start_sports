const crypto = require('crypto');

exports.GetSession = (session)=> {
    return session;
}

exports.validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};

exports.capitalizeFirstLetter = (string) => {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

exports.formatDate = (date, format) => {
    const d = new Date(date);
    const pad = (n) => String(n).padStart(2, '0');
    return format
        .replace('YYYY', d.getFullYear())
        .replace('MM',   pad(d.getMonth() + 1))
        .replace('DD',   pad(d.getDate()))
        .replace('HH',   pad(d.getHours()))
        .replace('mm',   pad(d.getMinutes()))
        .replace('ss',   pad(d.getSeconds()));
}

exports.CurrentDateFunction = () => {
    const currentDate = new Date();
    return currentDate;
}

exports.DateFunction = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const date = month + '-' + day + '-' + year;
    return date;
}

exports.getNextDate = (dateString) => {
    const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));
    const date = new Date(year, month - 1, day);
    date.setDate(date.getDate() + 1);
    const newDay = String(date.getDate()).padStart(2, '0');
    const newMonth = String(date.getMonth() + 1).padStart(2, '0');
    const newYear = date.getFullYear();
    return `${newDay}-${newMonth}-${newYear}`;
}

exports.DateAndTimeFunction = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const seconds = now.getSeconds();
    const date = day + '-' + month + '-' + year + ' ' + hours + ':' + minutes + ':' + seconds;
    return date;
}

exports.getDateAndTime = () => {
    const date = new Date();
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
}

exports.getFormattedDate = (format) => {
    return exports.formatDate(new Date(), format);
}

exports.generateSlug = (name) => {
    if (!name) return '';
    return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
}

// NOTE: These are static approximate exchange rates.
// In production, replace with a live exchange rate API call.
exports.convertCurrency = (amount, fromCurrency, toCurrency) => {
    const rates = {
        INR:  1,
        USD:  0.012,
        AED:  0.044,
        EUR:  0.011,
        GBP:  0.0094,
    };

    const symbols = {
        INR: '₹',
        USD: '$',
        AED: 'د.إ',
        EUR: '€',
        GBP: '£',
    };

    const inINR = amount / rates[fromCurrency];
    const converted = inINR * rates[toCurrency];

    return {
        amount: converted.toFixed(2),
        symbol: symbols[toCurrency],
        display: `${symbols[toCurrency]} ${converted.toFixed(2)}`
    };
};

exports.phoneValidation = (mobile) => {
    const regex = /^[0-9]{10}$/;
    return regex.test(mobile);
}

exports.pincodeValidation = (pincode) => {
    const regex = /^[0-9]{6}$/;
    return regex.test(pincode);
}

exports.generateRandomString = (length) => {
    const characters = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
}

exports.generateRandomNumber = () => {
    return Math.floor(10000000 + Math.random() * 90000000);
}

exports.generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000);
}

exports.getServerTime = () => {
    return Math.floor(Date.now() / 1000);
}

exports.getUserAgent = (req) => {
    return req.headers['user-agent'];
}

exports.getUserIp = (req) =>{
    return req.headers['x-forwarded-for'] || req.connection.remoteAddress;
}

exports.amountInWords = (amount) => {
    const change_words = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
    const here_digits = ['', 'Hundred', 'Thousand', 'Lakh', 'Crore'];
    let amount_after_decimal = Math.round((amount - Math.floor(amount)) * 100);
    let num = Math.floor(amount);
    let string = [], amt_hundred, x = 0;

    while (num > 0) {
        let get_divider = (x == 2) ? 10 : 100;
        let amount = Math.floor(num % get_divider);
        num = Math.floor(num / get_divider);
        x += (get_divider == 10) ? 1 : 2;
        if (amount) {
            const counter = string.length;
            let add_plural = (counter && amount > 9) ? 's' : '';
            amt_hundred = (counter == 1 && string[0]) ? ' and ' : '';
            string.push((amount < 20) ? change_words[amount] + ' ' + here_digits[counter] + add_plural + amt_hundred : tens[Math.floor(amount / 10)] + ' ' + change_words[amount % 10] + ' ' + here_digits[counter] + add_plural + amt_hundred);
        } else {
            string.push('');
        }
    }

    let implode_to_Rupees = string.reverse().join('');
    let get_paise = (amount_after_decimal > 0) ? ` And ${change_words[Math.floor(amount_after_decimal / 10)]} ${change_words[amount_after_decimal % 10]} Paise` : '';

    return implode_to_Rupees ? `${implode_to_Rupees} Rupees` : '' + get_paise;
}

// Encrypt plaintext using AES-256-CBC with SHA-256 key derivation.
// A random IV is generated per call and prepended to the ciphertext as hex:ciphertext.
exports.encrypt = (plainText, key) => {
    const keyBuffer = crypto.createHash('sha256').update(key).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', keyBuffer, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
};

// Decrypt ciphertext produced by encrypt().
// Extracts the prepended IV before decrypting.
exports.decrypt = (encryptedText, key) => {
    const keyBuffer = crypto.createHash('sha256').update(key).digest();
    const [ivHex, ciphertext] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-cbc', keyBuffer, iv);
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
};

exports.generateLeadNo = (lastLeadNumber = null, purpose) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    let serial = 1;
    if (lastLeadNumber) {
      const parts = lastLeadNumber.split('/');
      const lastMonth = parts[2];
      const lastYear = parts[3];
      const lastSerial = parts[4];
      if (lastMonth === mm && lastYear === yy) {
        serial = parseInt(lastSerial) + 1;
      }
    }
    const serialStr = String(serial).padStart(2, '0');
    return `TYDD/${dd}/${mm}/${yy}/${serialStr}`;
};

exports.generateExpenseNo = (lastExpenseNo = null) => {
    const today = new Date();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);

    let serial = 1;

    if (lastExpenseNo) {
      const parts = lastExpenseNo.split('/');
      const lastSerial = parts[2];
      const lastMonth  = parts[3];
      const lastYear   = parts[4];

      if (lastMonth === mm && lastYear === yy) {
        serial = parseInt(lastSerial, 10) + 1;
      }
    }
    const serialStr = String(serial).padStart(2, '0');
    return `TYDD/EXP/${serialStr}/${mm}/${yy}`;
};

// Generate secure random token
exports.generateToken = (length = 40) => {
    return crypto.randomBytes(length).toString('hex');
};

// Generate session ID
exports.generateSessionId = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Access token expiry — 15 minutes
exports.getAccessTokenExpiry = () => {
    return new Date(Date.now() + 15 * 60 * 1000);
};

// Refresh token expiry — 7 days
exports.getRefreshTokenExpiry = () => {
    return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
};

// Check if token is expired
exports.isTokenExpired = (expiryDate) => {
    return new Date() > new Date(expiryDate);
};

// Extract device info from user-agent
exports.getDeviceInfo = (req) => {
    const ua = req.headers['user-agent'] || '';
    const ip = req.headers['x-forwarded-for'] ||
                req.connection.remoteAddress || '';

    let device_type = 'desktop';
    if (/mobile/i.test(ua))      device_type = 'mobile';
    else if (/tablet/i.test(ua)) device_type = 'tablet';

    let browser = 'unknown';
    if (/chrome/i.test(ua))       browser = 'Chrome';
    else if (/firefox/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua))  browser = 'Safari';
    else if (/edge/i.test(ua))    browser = 'Edge';

    let os = 'unknown';
    if (/windows/i.test(ua))          os = 'Windows';
    else if (/mac/i.test(ua))         os = 'MacOS';
    else if (/linux/i.test(ua))       os = 'Linux';
    else if (/android/i.test(ua))     os = 'Android';
    else if (/iphone|ipad/i.test(ua)) os = 'iOS';

    return {
        device_type,
        browser,
        os,
        ip_address:  ip,
        device_name: `${browser} on ${os}`
    };
};
