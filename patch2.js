const fs = require('fs');
const path = 'src/app/dashboard/settings/page.tsx';

let content = fs.readFileSync(path, 'utf8');

const paymentsTabOld = `            {activeTab === "payments" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
              {/* Payment Integrations */}
              <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                    dY'3 Payment Integration
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Configure how your customers pay for their orders online.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Active Payment Gateway</label>`;
                  
const paymentsTabNew = `            {activeTab === "payments" && (
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
              {/* Payment Integrations */}
              <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-gray-800 dark:text-zinc-200 flex items-center gap-2">
                    dY'3 Payment Integration
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-zinc-400 dark:text-zinc-500 mt-0.5">
                    Configure how your customers pay for their orders online.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Active Payment Gateway</label>`;

content = content.replace(paymentsTabOld, paymentsTabNew);

const phonePeEndPattern = /placeholder="[^"]+"(\s*)\/>(\s*)<\/div>(\s*)<\/div>(\s*)\)}/m;

const match = content.match(phonePeEndPattern);
if (match) {
    const matchedText = match[0];
    const newEnd = `${matchedText}
              </div>
                <div className="pt-6">
                  <button type="button" onClick={savePaymentSettings} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors">
                    {saving ? "Saving Payment Settings..." : "Save Payment Configurations"}
                  </button>
                </div>
              </>`;
    content = content.replace(matchedText, newEnd);
} else {
    console.error("Could not find the end of the payments tab!");
}

const finalCloseOld = `                <div className="pt-6">
                  <button type="button" onClick={savePaymentSettings} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors">
                    {saving ? "Saving Payment Settings..." : "Save Payment Configurations"}
                  </button>
                </div>
              </>
              </div>
            )}`;

const finalCloseNew = `                <div className="pt-6">
                  <button type="button" onClick={savePaymentSettings} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors">
                    {saving ? "Saving Payment Settings..." : "Save Payment Configurations"}
                  </button>
                </div>
              </>
              )}
            </div>
            )}`;
content = content.replace(finalCloseOld, finalCloseNew);

fs.writeFileSync(path, content);
console.log('Saved patch2');
