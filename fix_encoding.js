const fs = require('fs');

let content = fs.readFileSync('src/app/dashboard/settings/page.tsx', 'utf8');

const s1 = `  const [activeTab, setActiveTab] = useState<"general" | "operations" | "appearance" | "payments">("general");`;
const r1 = `  const [activeTab, setActiveTab] = useState<"general" | "operations" | "appearance" | "payments">("general");
  const [isPaymentsAuthenticated, setIsPaymentsAuthenticated] = useState(false);
  const [authPassword, setAuthPassword] = useState("");
  const [verifyingPaymentAuth, setVerifyingPaymentAuth] = useState(false);
  const [paymentAuthError, setPaymentAuthError] = useState("");`;
content = content.split(s1).join(r1);

const s2 = `    fetch("/api/hotel/payment-settings")
      .then((r) => r.json())
      .then((ps) => {
        setForm((prev: any) => ({
          ...prev,
          paymentSettings: {
            active_pg: ps?.active_pg || "none",
            razorpay: {
              key_id: ps?.razorpay?.key_id || "",
              key_secret: ps?.razorpay?.key_secret || "",
            },
            phonepe: {
              merchant_id: ps?.phonepe?.merchant_id || "",
              salt_key: ps?.phonepe?.salt_key || "",
              salt_index: ps?.phonepe?.salt_index || "",
              env: ps?.phonepe?.env || "TEST",
            }
          }
        }));
      })
      .catch(console.error);`;
const r2 = ``;
content = content.split(s2).join(r2);

const s3 = `  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/hotel/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || "Failed to save settings");
        return;
      }
      
      const psRes = await fetch("/api/hotel/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.paymentSettings),
      });
      
      if (!psRes.ok) {
        setSaveError("Profile saved, but failed to save Payment Gateway settings.");
        return;
      }`;
const r3 = `  async function verifyPaymentAuth(e: React.FormEvent) {
    e.preventDefault();
    setVerifyingPaymentAuth(true);
    setPaymentAuthError("");
    try {
      const res = await fetch("/api/hotel/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: authPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPaymentAuthError(data.error || "Incorrect password");
        return;
      }
      setIsPaymentsAuthenticated(true);
      setAuthPassword("");

      // Load payment settings now
      fetch("/api/hotel/payment-settings")
        .then((r) => r.json())
        .then((ps) => {
          setForm((prev: any) => ({
            ...prev,
            paymentSettings: {
              active_pg: ps?.active_pg || "none",
              razorpay: {
                key_id: ps?.razorpay?.key_id || "",
                key_secret: ps?.razorpay?.key_secret || "",
              },
              phonepe: {
                merchant_id: ps?.phonepe?.merchant_id || "",
                salt_key: ps?.phonepe?.salt_key || "",
                salt_index: ps?.phonepe?.salt_index || "",
                env: ps?.phonepe?.env || "TEST",
              }
            }
          }));
        })
        .catch(console.error);

    } catch {
      setPaymentAuthError("Network error. Please try again.");
    } finally {
      setVerifyingPaymentAuth(false);
    }
  }

  async function savePaymentSettings() {
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const psRes = await fetch("/api/hotel/payment-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form.paymentSettings),
      });
      if (!psRes.ok) {
        const d = await psRes.json();
        setSaveError(d.error || "Failed to save Payment Gateway settings.");
        return;
      }
      setSaved(true);
    } catch {
      setSaveError("Network error.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaveError("");
    setSaved(false);
    try {
      const res = await fetch("/api/hotel/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!res.ok) {
        const d = await res.json();
        setSaveError(d.error || "Failed to save settings");
        return;
      }`;
content = content.split(s3).join(r3);

const s4 = `            {activeTab === "payments" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
            {/* Payment Integrations */}
            <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">`;
const r4 = `            {activeTab === "payments" && (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                {!isPaymentsAuthenticated ? (
                  <form onSubmit={verifyPaymentAuth} className="max-w-md mx-auto mt-10 p-6 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-xl shadow-sm text-center">
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
                    <button type="submit" className="w-full bg-slate-900 dark:bg-white text-white dark:text-black py-2 rounded-lg font-medium" disabled={verifyingPaymentAuth}>
                      {verifyingPaymentAuth ? "Verifying..." : "Verify Password"}
                    </button>
                  </form>
                ) : (
                  <>
            {/* Payment Integrations */}
            <div className="border border-gray-200 dark:border-zinc-800 rounded-xl p-4 space-y-4">`;
content = content.split(s4).join(r4);

const s5 = `              {/* Thermal Printer Size */}`;
const r5 = `                <div className="pt-6 border-t border-slate-100 dark:border-zinc-800">
                  <button type="button" onClick={savePaymentSettings} disabled={saving} className="w-full bg-green-600 hover:bg-green-700 text-white py-2 rounded-lg font-medium transition-colors">
                    {saving ? "Saving Payment Settings..." : "Save Payment Configurations"}
                  </button>
                </div>
              </div>
              </>
                )}

              {/* Thermal Printer Size */}`;
content = content.split(s5).join(r5);

const s6 = `{/* Action Footer */}
          <div className="pt-6 border-t border-slate-100 dark:border-zinc-800/50 flex flex-col sm:flex-row items-center gap-4">
            <button
              type="submit"
              disabled={saving}
              className="w-full sm:w-auto min-w-[200px] h-11 text-base bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
            >
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>`;
const r6 = `{/* Action Footer */}
          {activeTab !== "payments" && (
            <div className="pt-6 border-t border-slate-100 dark:border-zinc-800/50 flex flex-col sm:flex-row items-center gap-4">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto min-w-[200px] h-11 text-base bg-orange-600 hover:bg-orange-700 text-white rounded-lg font-medium"
              >
                {saving ? "Saving Changes..." : "Save Settings"}
              </button>`;
content = content.split(s6).join(r6);

const s7 = `              <p className="text-green-600 font-medium animate-in fade-in">
                ✓ Settings saved successfully!
              </p>
            )}
          </div>`;
const r7 = `              <p className="text-green-600 font-medium animate-in fade-in">
                ✓ Settings saved successfully!
              </p>
            )}
          </div>
          )}`;
content = content.split(s7).join(r7);

fs.writeFileSync('src/app/dashboard/settings/page.tsx', content, 'utf8');
console.log('Successfully fixed encoding and patched file!');
