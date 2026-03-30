const { execSync } = require('child_process');
const crypto = require('crypto');

exports.GetSession = (session)=> {
    return session
}

//exports.passwordEncrypt = (password) => {
//    const saltRounds = 10;
//    return bcrypt.hashSync(password, saltRounds);
//}
//
//exports.passwordDecrypt = (password, hash) => {
//    return bcrypt.compareSync(password, hash);
//}

exports.validateEmail = (email) => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return regex.test(email);
};
// Session ID generate 
exports.generateSessionId = () => {
    return crypto.randomBytes(32).toString('hex');
};

// Check if token is expired or not
exports.isTokenExpired = (expiryDate) => {
    return new Date() > new Date(expiryDate);
};

// Device info nikalna user-agent se
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

exports.capitalizeFirstLetter = (string) => {
    if (!string) return '';
    return string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();
}

exports.formatDate = (date, format) => {
    const moment = require('moment');
    return moment(date).format(format);
}

exports.CurrentDateFunction = () => {
    const currentDate = new Date();
    return currentDate;
}

exports.DateFunction = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const date = month + '-' + day + '-' + year
    return date;
}

exports.getNextDate = (dateString) => {
    // Split the input string into day, month, and year
    const [day, month, year] = dateString.split('-').map(num => parseInt(num, 10));

    // Create a new Date object (months are 0-based in JavaScript, so subtract 1 from the month)
    const date = new Date(year, month - 1, day);

    // Add one day
    date.setDate(date.getDate() + 1);

    // Format the new date back to dd-mm-yyyy
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
    const date = day + '-' + month + '-' + year + ' ' + hours + ':' + minutes + ':' + seconds
    return date;
}

exports.getDateAndTime = () => {
    const date = new Date();
    return date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true });
}

exports.getFormattedDate = (format) => {
    const date = new Date();
    const moment = require('moment');
    return moment(date).format(format);
}

exports.autoRefresh = (res, duration) => {
    res.setHeader("Refresh", duration);
}

exports.generateSlug = (name) => {
    if (!name) return '';
    return name.toLowerCase().replace(/\s+/g, "-").replace(/[^\w-]+/g, "");
}

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

exports.compressImage = (source, destination, quality) => {
    return sharp(source)
        .jpeg({ quality })
        .toFile(destination);
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

exports.generateToken = (length) => {
    return crypto.randomBytes(length).toString('hex');
}

exports.generateRandomNumber = () => {
    return Math.floor(10000000 + Math.random() * 90000000);
}

exports.generateOtp = () => {
    return Math.floor(100000 + Math.random() * 900000);
}

exports.getMAC = () => {
    const mac = execSync('getmac').toString();
    return mac.match(/([A-Fa-f0-9]{2}[:-]){5}[A-Fa-f0-9]{2}/)[0];
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
            let add_plural = ((counter = string.length) && amount > 9) ? 's' : '';
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

// Multi Security encrypt
function hextobin(hexString) {
    let binString = '';
    for (let i = 0; i < hexString.length; i += 2) {
        binString += String.fromCharCode(parseInt(hexString.substr(i, 2), 16));
    }
    return binString;
}

exports.encrypt = (plainText, key) => {
    // Create an MD5 hash of the key (it will be 16 bytes long)
    const md5Key = crypto.createHash('md5').update(key).digest(); 
    
    // Use a fixed 16-byte initialization vector (IV)
    const initVector = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    
    // Create the cipher using AES-128-CBC with the 16-byte key and IV
    const cipher = crypto.createCipheriv('aes-128-cbc', md5Key, initVector);
    
    // Encrypt the plainText
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    return encrypted;
}
// Multi Security decrypt
exports.decrypt = (encryptedText, key) => {
    // Create an MD5 hash of the key (it will be 16 bytes long)
    const md5Key = crypto.createHash('md5').update(key).digest(); // Directly get a Buffer
    
    // Use a fixed 16-byte initialization vector (IV)
    const initVector = Buffer.from([0x00, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x08, 0x09, 0x0a, 0x0b, 0x0c, 0x0d, 0x0e, 0x0f]);
    
    // Create the decipher using AES-128-CBC with the 16-byte key and IV
    const decipher = crypto.createDecipheriv('aes-128-cbc', md5Key, initVector);
    
    // Decrypt the encryptedText
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
}

exports.generateLeadNo = (lastLeadNumber = null, purpose) => {
    const today = new Date();
    const dd = String(today.getDate()).padStart(2, '0');
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const yy = String(today.getFullYear()).slice(-2);
    let serial = 1;
    if (lastLeadNumber) {
      const parts = lastLeadNumber.split('/'); 
      // parts = ["TYDD", "dd", "mm", "yy", "serial"]
      const lastDay = parts[1];
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
  


// Token generate karna — random secure string
exports.generateToken = (length = 40) => {
    return crypto.randomBytes(length).toString('hex');
};

// Session ID generate karna
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

// Token expired hai ya nahi check karna
exports.isTokenExpired = (expiryDate) => {
    return new Date() > new Date(expiryDate);
};

// Device info nikalna user-agent se
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
