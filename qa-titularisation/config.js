/* Public browser key for isolated synthetic-data Supabase QA project.
 * NO service_role or secret credentials. The main project's PUBLIC Auth endpoint
 * is used only for verified inspector federation; QA remains its own project.
 * Never reuse this config on the production main portal.
 */
window.REPORT03_CLOUD_CONFIG=Object.freeze({
  supabaseUrl:"https://npxwshvcrowbfoiqyrwx.supabase.co",
  publishableKey:"sb_publishable_pDubnjsczXy4D2bQzHAm7A_jqPIbJlm",
  temporaryCommitteeEnabled:true,
  qaOnly:true,
  // Public API credentials are not passwords or service keys.
  primarySupabaseUrl:"https://uxtsyzyotnohxvopgcmh.supabase.co",
  primaryPublishableKey:"sb_publishable_hObSzRf1Sf9HTrUppubkXA_BKT5ZMJe"
});
