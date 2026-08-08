const fs = require("fs");
const root = process.cwd();

const RULE = " // eslint-disable-line no-magic-numbers -- ";

const jobs = [
  ["CRUD/Read/ReadData.matching.js",
    (s) => s.replace(
      /(const DEGREE_BUFFER = MAX_RADIUS_KM \/ 111 \+ 0\.01;)/,
      "$1" + RULE + "km-per-degree and buffer padding",
    )],
  ["Controllers/Admin.controller.js",
    (s) => s.replace(
      /(const lastLines = lines\.slice\(-500\)\.reverse\(\);)/,
      "$1" + RULE + "last 500 log lines",
    )],
  ["Controllers/ShipperRequest.controller.js",
    (s) => s.replace(
      /(Math\.floor\(1000 \+ Math\.random\(\) \* 900000\))/,
      "$1" + RULE + "4-digit verification code",
    )],
  ["Database/Migrations/apply_migration.js",
    (s) => s.replace(
      /(query\.substring\(0, 50\))/,
      "$1" + RULE + "truncate log output",
    )],
  ["Middleware/GlobalErrorHandler.js",
    (s) => s.replace(
      /(if \(error\.code === 11000\))/,
      "$1" + RULE + "MongoDB duplicate key error code",
    )],
  ["Services/Account/accountStatus.service.js",
    (s) => s.replace(
      /(resolvedUserUniqueId\?\.slice\(0, 8\))/,
      "$1" + RULE + "truncate unique id",
    )],
  ["Services/Commission.service.js",
    (s) => s.replace(
      /(toISOString\(\)\.slice\(0, 19\))/g,
      "$1" + RULE + "ISO datetime without ms",
    )],
  ["Services/CompanyDelinquency.service.js",
    (s) => s.replace(
      /(\.slice\(0, 19\))/,
      "$1" + RULE + "ISO datetime without ms",
    )],
  ["Services/Database/tableManage.service.js",
    (s) => s.replace(
      /(substring\(0, 64\))/,
      "$1" + RULE + "MySQL identifier max length",
    )],
  ["Services/DriverQueue.service.js",
    (s) => s.replace(
      /(new Date\(\)\.toISOString\(\)\.slice\(0, 10\))/,
      "$1" + RULE + "YYYY-MM-DD",
    )],
  ["Services/DriverRequest/actionTakeFromStreet.service.js",
    (s) => s.replace(
      /(Math\.floor\(Math\.random\(\) \* 100000000\))/,
      "$1" + RULE + "8-digit reference code",
    )],
  ["Services/SubscriptionPlanPricing.service.js",
    (s) => s.replace(
      /(if \(month < 1 \|\| month > 12 \|\| day < 1 \|\| day > 31\))/,
      "$1" + RULE + "calendar bounds",
    )],
  ["Services/UserDelinquency/create.service.js",
    (s) => s.replace(
      /(defaultType\?\.duplicateCheckWindowHours \|\| 24)/,
      "$1" + RULE + "default 24h window",
    )],
  ["Utils/emailSender.js",
    (s) => s
      .replace(/(\? body\.substring\(0, 50\))/, "$1" + RULE + "truncate preview")
      .replace(/(parseInt\(PORT\) === 465)/, "$1" + RULE + "implicit-TLS SMTP port"),
  ],
];

for (const [file, fn] of jobs) {
  const abs = `${root}/${file}`;
  let src = fs.readFileSync(abs, "utf8");
  const out = fn(src);
  if (out !== src) {
    fs.writeFileSync(abs, out);
    console.log("done", file);
  } else {
    console.log("NO MATCH", file);
  }
}
