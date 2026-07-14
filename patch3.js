const fs = require('fs');
const path = 'src/app/dashboard/settings/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Find activeTab === "payments" up to Active Payment Gateway
const startPattern = /\{activeTab === "payments" && \([\s\S]*?<label className="block text-sm font-medium mb-1">Active Payment Gateway<\/label>/;

const replacementStart = `{activeTab === "payments" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {!isPaymentsAuthenticated ? (
                  <div className="max-w-md mx-auto mt-10 p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm text-center">
                    <h3 className="text-xl font-bold mb-2">Secure Area</h3>
                    <p className="text-sm text-gray-500 mb-6">Please verify your account password to view and manage your payment gateway keys.</p>
                    <input
                      type="password"
                      value={authPassword}
                      onChange={(e) => setAuthPassword(e.target.value)}
                      placeholder="Enter your password"
                      className="w-full border border-slate-200 dark:border-zinc-800 rounded-lg px-3 py-2 mb-4 bg-white dark:bg-zinc-900 text-center"
                      required
                    />
                    {paymentAuthError && <p className="text-red-500 text-sm mb-4">{paymentAuthError}</p>}
                    <button type="button" onClick={verifyPaymentAuth} className="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-2 rounded-lg font-medium" disabled={verifyingPaymentAuth}>
                      {verifyingPaymentAuth ? "Verifying..." : "Verify Password"}
                    </button>
                  </div>
                ) : (
                  <>
              <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                    Payment Integration
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Configure how your customers pay for their orders online.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Active Payment Gateway</label>`;

if (startPattern.test(content)) {
    content = content.replace(startPattern, replacementStart);
    console.log("Replaced start");
} else {
    console.log("Could not find start block");
}

fs.writeFileSync(path, content);
