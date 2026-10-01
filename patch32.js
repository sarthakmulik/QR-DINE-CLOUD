const fs = require('fs');
const file = 'src/app/dine/[hotelId]/[tableNumber]/DineClient.tsx';
let content = fs.readFileSync(file, 'utf8');

content = content.replace(
  /\{parseInt\(tableNumber\) >= 900000 \? "Takeaway Order" : "Table " \+ tableNumber\}/g,
  '{parseInt(tableNumber) >= 900000 ? (state.orderNumber ? Takeaway Order # : "Takeaway Order") : "Table " + tableNumber}'
);
fs.writeFileSync(file, content);
