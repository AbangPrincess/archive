/*
 * Privacy Policy and Terms of Use. Keep these in step with the code:
 * storage lives in src/lib/db.ts, src/lib/pin.ts and src/lib/settings.ts;
 * outside services are used only in src/lib/geo.ts, src/screens/PlacesScreen.tsx,
 * src/lib/speech.ts / DictateScreen.tsx (speech-to-text) and ListenScreen.tsx (read aloud).
 */
export const LEGAL_UPDATED = 'November 24, 2026';

export function PrivacyPolicy() {
  return (
    <>
      <p className="small">Last updated {LEGAL_UPDATED}</p>
      <p>Archive is a personal journal that runs in your web browser. It has no accounts, no sign-in and no database or server of its own. This policy explains exactly what happens to the things you put in it.</p>

      <h3>What’s Stored, and Where</h3>
      <ul>
        <li>Your entries, headlines, diary text, photos, voice recordings, favorites and places are saved only in this browser’s storage (IndexedDB) on this device.</li>
        <li>Your PIN is saved on this device as a salted, one-way hash, never as the digits themselves. Your PIN hint, lock timer and app settings are saved in this browser’s local storage.</li>
        <li>Photos are resized on your device before they’re saved. Nothing you add is uploaded to us.</li>
      </ul>

      <h3>What We Don’t Do</h3>
      <ul>
        <li>We don’t collect, sell, rent or share your personal data. We can’t see your journal at all.</li>
        <li>There are no ads, analytics, trackers or tracking cookies in the app. Fonts are bundled with the app, so no font service is contacted.</li>
      </ul>

      <h3>Services the App Contacts</h3>
      <p>A few features need an outside service. They’re only contacted when you use that feature:</p>
      <ul>
        <li><strong>Places map:</strong> map images are loaded from OpenStreetMap’s free tile servers. Like any website, those servers receive your IP address and the map area being shown.</li>
        <li><strong>Add Location:</strong> when you tap it, your browser asks for your location, and the coordinates are sent to OpenStreetMap’s Nominatim service to look up a place name. The result is then stored only on your device.</li>
        <li><strong>Directions:</strong> tapping the directions button opens openstreetmap.org in a new tab.</li>
        <li><strong>Speech-to-text:</strong> transcription uses your browser’s built-in speech recognition. In some browsers (for example, Google Chrome) your speech is sent to the browser maker’s servers to be turned into text; in others it happens on the device. The audio recording the app saves stays on your device.</li>
        <li><strong>Read Aloud:</strong> uses your device’s or browser’s voices. Some browsers offer online voices that send the text being read to the browser maker.</li>
      </ul>
      <p>Those services follow their own privacy policies. The website host may also keep standard server logs (such as IP addresses) needed to deliver the app’s files.</p>

      <h3>Permissions</h3>
      <p>The app asks for the microphone, camera and location only when you start a feature that needs them. You can turn them off at any time in your browser or device settings.</p>

      <h3>Security</h3>
      <p>The PIN keeps casual eyes out of your journal, but it doesn’t encrypt your data. Anyone with full access to this device and its browser data could still read it, so keep your device itself locked.</p>

      <h3>Keeping and Deleting Your Data</h3>
      <p>Your journal stays on this device until you delete it. You can delete single entries, or everything from Settings › Delete All Data. Clearing this site’s data in your browser also erases it. Because nothing is stored with us, we can’t recover lost or deleted entries.</p>

      <h3>Children</h3>
      <p>Archive isn’t directed at children under 13.</p>

      <h3>Changes and Contact</h3>
      <p>If this policy changes, the date above will change too. Questions can be sent through the contact details on the owner’s portfolio, linked in the footer.</p>
    </>
  );
}

export function TermsOfUse() {
  return (
    <>
      <p className="small">Last updated {LEGAL_UPDATED}</p>
      <p>By using Archive, you agree to these terms.</p>

      <h3>Personal Use</h3>
      <p>Archive is provided for your own, personal journaling. You’re responsible for what you write, record and upload, and for having the right to use any photos you add.</p>

      <h3>Your Content</h3>
      <p>Everything you create belongs to you and stays on your device. We don’t claim any rights to it.</p>

      <h3>Backups</h3>
      <p>Your journal lives only in this browser. Clearing site data, uninstalling the browser or losing the device can erase it permanently. Use Settings › Export Entries to keep your own copy of your text.</p>

      <h3>Outside Services</h3>
      <p>Maps and place names come from OpenStreetMap and its contributors, and speech features come from your browser. Their availability and terms are outside our control.</p>

      <h3>No Warranty</h3>
      <p>The app is provided “as is” and “as available,” without warranties of any kind. To the extent the law allows, the owner isn’t liable for any loss of data or other damages from using it.</p>

      <h3>Changes</h3>
      <p>These terms may be updated from time to time. Continuing to use the app after a change means you accept the updated terms.</p>
    </>
  );
}
