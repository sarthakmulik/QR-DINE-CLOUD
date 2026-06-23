const Razorpay = require("razorpay");

async function test() {
  try {
    const instance = new Razorpay({
      key_id: "rzp_test_T59XtT4684XmhO",
      key_secret: "iVFKo8c3T7nT36iSv72LpLNX"
    });

    const options = {
      amount: 50000, // 500 INR
      currency: "INR",
      receipt: "receipt_4baf3851-e331-494a-a8c5-4ee99be474bb",
    };

    const order = await instance.orders.create(options);
    console.log("Success! Order Created:");
    console.dir(order);
  } catch (err) {
    console.error("Failed to create order:", err);
  }
}

test();
