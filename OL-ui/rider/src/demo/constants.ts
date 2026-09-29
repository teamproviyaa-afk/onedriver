/** Demo credentials and codes — DATA_MODE=local_demo only. Never production rates or secrets. */
export const DEMO_OTP_CODE = '123456';
export const DEMO_RETURNING_PHONE = '9876543210';
export const DEMO_STORE_INVITE_CODES = ['MEGA-2024', 'STORE-A', 'ONELOCAL'];
export const DEMO_RIDER_NAME = 'Rahul Sharma';
export const DEMO_RIDER_CODE = 'RIDER-1001';
export const DEMO_OFFER_DELAY_SECONDS = 4;
export const DEMO_REOFFER_DELAY_SECONDS = 8;
export const DEMO_STATUS_STEP_SECONDS = { submitted: 6, verificationPending: 14 } as const;
export const DEMO_STORAGE_KEY = 'onelocal.rider.demo.world.v1';

/** Local demo cash deposits "open" this instead of a Cashfree checkout page. */
export const DEMO_CHECKOUT_PREFIX = 'demo://cashfree-checkout/';
