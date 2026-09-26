import { DemoAuthProvider } from '@/auth/demoAuthProvider';
import { DEMO_OTP_CODE, DEMO_RETURNING_PHONE } from '@/demo/constants';

describe('DemoAuthProvider', () => {
  it('sends a deterministic OTP and distinguishes new vs returning riders', async () => {
    const a = new DemoAuthProvider();
    const c = await a.sendOtp('98765 43210');
    expect(c.demoCode).toBe(DEMO_OTP_CODE);
    expect(c.resendAfterSeconds).toBe(30);
    const s = await a.verifyOtp(DEMO_RETURNING_PHONE, DEMO_OTP_CODE);
    expect(s.isNewUser).toBe(false);
    const n = await a.verifyOtp('9000000000', DEMO_OTP_CODE);
    expect(n.isNewUser).toBe(true);
    expect(await a.restoreSession()).toMatchObject({ phone: '9000000000' });
    await a.signOut();
    expect(await a.restoreSession()).toBeNull();
  });

  it('rejects a wrong OTP with attempts left and invalid phones', async () => {
    const a = new DemoAuthProvider();
    await a.sendOtp('9000000001');
    await expect(a.verifyOtp('9000000001', '000000')).rejects.toMatchObject({ code: 'otp_invalid' });
    await expect(a.sendOtp('12345')).rejects.toMatchObject({ code: 'validation' });
  });
});
