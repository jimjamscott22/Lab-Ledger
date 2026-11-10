// A small lab that mirrors the layout of labs/2026-10-23-ad-user-onboarding.html:
// a <details> block under Prerequisites, and a scenario made of several block elements.
export const SAMPLE_LAB_FILE = '2026-11-01-sample-onboarding.html';

export const SAMPLE_LAB_HTML = `<!doctype html><html><head><title>Lab 08: Sample Onboarding</title></head><body>
<h1>Lab 08: Sample Onboarding</h1>
<h2>Skill &amp; Scenario</h2>
<p><strong>Skill:</strong> Create users with the ActiveDirectory PowerShell module.</p>
<div class="card ticket"><strong>Ticket #10423 – Priority: Normal</strong><br>"Hi IT, our new hire <b>Taylor Reed</b> starts Monday."</div>
<h2>Prerequisites (all free)</h2>
<ul><li>A domain controller</li></ul>
<details><summary>Not built yet? Quick DC setup</summary><pre><code>Install-WindowsFeature AD-Domain-Services</code></pre></details>
<h2>Steps</h2>
<div class="card step"><label><input type="checkbox"> Create the user</label></div>
<h2>Interview Questions</h2>
<details><summary>1. A user says they're locked out. What do you check?</summary><p>Check LockedOut.</p></details>
<details><summary>2. Why assign permissions to a group?</summary><p>Scalability.</p></details>
<h2>Stretch Goal</h2>
<details><summary>Hint</summary><p>Use Import-Csv.</p></details>
</body></html>`;
