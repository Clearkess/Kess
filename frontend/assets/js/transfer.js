let verified = null;
let idemKey = null;
const bank = document.querySelector('#bank'), account = document.querySelector('#account'), result = document.querySelector('#result'), verify = document.querySelector('#verify'), send = document.querySelector('#send'), msg = document.querySelector('#msg');
const uuid = () => window.crypto && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
(async () => { try { const d = await api('/banks'); bank.innerHTML = '<option value="">Select Nigerian bank</option>' + d.banks.filter((b) => b.active !== false).map((b) => `<option value="${b.code}">${b.name}</option>`).join(''); } catch (e) { msg.textContent = e.message; } })();
verify.onclick = async () => {
  if (!bank.value || !/^[0-9]{10}$/.test(account.value)) { msg.textContent = 'Select a bank and enter 10 digits'; return; }
  verify.disabled = true;
  try { const d = await api('/banks/resolve?bankCode=' + encodeURIComponent(bank.value) + '&accountNumber=' + account.value); verified = d.account; idemKey = null; result.classList.remove('hidden'); result.innerHTML = `✓ <b>${verified.accountName}</b><br><small>${verified.accountNumber}</small>`; send.disabled = false; msg.textContent = 'Account verified. This is still a simulated transfer.'; }
  catch (e) { verified = null; result.classList.add('hidden'); send.disabled = true; msg.textContent = e.message; }
  finally { verify.disabled = false; }
};
send.onclick = async () => {
  if (!verified) return; const amount = Number(document.querySelector('#amount').value);
  if (!amount || amount <= 0) { msg.textContent = 'Enter a valid amount'; return; }
  if (!confirm(`Confirm SIMULATED transfer of ₦${amount.toLocaleString()} to ${verified.accountName}?\n\nNo real money will move.`)) return;
  idemKey = idemKey || uuid(); send.disabled = true;
  try { const d = await api('/transfers/simulated', { method: 'POST', headers: { 'Idempotency-Key': idemKey }, body: JSON.stringify({ bankCode: verified.bankCode, accountNumber: verified.accountNumber, accountName: verified.accountName, amount, description: document.querySelector('#description').value }) }); idemKey = null; msg.textContent = `✓ Simulated transfer completed. Reference: ${d.transaction.reference}`; }
  catch (e) { msg.textContent = `${e.message} (safe to retry — this attempt will not be charged twice)`; }
  finally { send.disabled = false; }
};