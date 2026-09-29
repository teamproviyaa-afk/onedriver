import { mapDocument } from '@/api/mappers';
import { DEMO_RETURNING_PHONE } from '@/demo/constants';
import { DEMO_KYC_TEST_VALUES, isValidPan, maskPan, normalizePan, parseDob } from '@/domain/kyc';
import { LocalDemoProvider } from '@/providers/localDemoProvider';

const newApplicant = async (phone = '9999900020') => {
  const p = new LocalDemoProvider();
  await p.attachPhone(phone);
  await p.register({ fullName: 'Asha Patil', phone });
  return p;
};

describe('KYC input rules', () => {
  it('normalises and checks PANs', () => {
    expect(normalizePan(' abcde 1234f ')).toBe('ABCDE1234F');
    expect(isValidPan('abcde1234f')).toBe(true);
    expect(isValidPan('ABCD1234F')).toBe(false);
    expect(maskPan('ABCDE1234F')).toBe('ABXXXXX34F');
  });

  it('reads a date of birth typed as DD-MM-YYYY', () => {
    const today = new Date('2026-09-29T00:00:00Z');
    expect(parseDob('12-03-1994', today)).toBe('1994-03-12');
    expect(parseDob('12/03/1994', today)).toBe('1994-03-12');
    expect(parseDob('31-02-1994', today)).toBeNull();
    expect(parseDob('1994-03-12', today)).toBeNull();
    expect(parseDob('01-01-2030', today)).toBeNull();
  });

  it('maps a server document (snake_case) including the refusal reason', () => {
    expect(mapDocument({ id: 'd1', kind: 'pan', status: 'rejected', number_masked: 'ABXXXXX34F', rejection_reason: 'This PAN is registered to someone else', reviewed_at: 'x' })).toEqual({
      id: 'd1',
      kind: 'pan',
      status: 'rejected',
      numberMasked: 'ABXXXXX34F',
      assetId: undefined,
      source: undefined,
      expiresOn: undefined,
      rejectionReason: 'This PAN is registered to someone else',
      reviewedAt: 'x',
    });
  });
});

describe('KYC checks (demo Secure ID server)', () => {
  it('Aadhaar via DigiLocker, then PAN; selfie waits for the Aadhaar photo, then passes', async () => {
    const p = await newApplicant();
    const selfie = await p.submitDocument({ kind: 'selfie', assetId: 's1', source: 'upload' });
    expect(selfie).toMatchObject({ status: 'pending', rejectionReason: expect.stringContaining('once Aadhaar is verified') });

    const { redirectUrl, verificationId } = await p.startDigilocker();
    expect(redirectUrl).toContain('digilocker=demo');
    expect(verificationId).toBeTruthy();
    const aadhaar = await p.submitDocument({ kind: 'aadhaar', source: 'digilocker', verificationId });
    expect(aadhaar).toMatchObject({ status: 'verified', numberMasked: 'XXXX XXXX 4821', source: 'digilocker' });
    expect((await p.getMe()).documents.find((d) => d.kind === 'selfie')?.status).toBe('verified');

    await expect(p.submitDocument({ kind: 'pan', number: 'ABC', source: 'upload' })).rejects.toMatchObject({ code: 'validation' });
    expect(await p.submitDocument({ kind: 'pan', number: 'abcde1234f', source: 'upload' })).toMatchObject({ status: 'verified', numberMasked: 'ABXXXXX34F' });
    const other = await p.submitDocument({ kind: 'pan', number: `${DEMO_KYC_TEST_VALUES.otherPersonPanPrefix}1234Z`, source: 'upload' });
    expect(other).toMatchObject({ status: 'rejected', rejectionReason: expect.stringContaining(DEMO_KYC_TEST_VALUES.otherPersonName) });
    expect((await p.submitDocument({ kind: 'pan', number: DEMO_KYC_TEST_VALUES.invalidPan, source: 'upload' })).status).toBe('rejected');
  });

  it('driving licence needs a date of birth until Aadhaar is verified; unknown licences are refused', async () => {
    const p = await newApplicant('9999900021');
    await expect(p.submitDocument({ kind: 'dl', assetId: 'a', number: 'MH14 20110012345', source: 'upload' })).rejects.toMatchObject({ code: 'validation' });
    expect(await p.submitDocument({ kind: 'dl', assetId: 'a', number: 'MH14 20110012345', source: 'upload', dob: '1994-03-12' })).toMatchObject({ status: 'verified', expiresOn: '2034-03-11' });
    const missing = await p.submitDocument({ kind: 'dl', assetId: 'a', number: 'MH14 20110010000', source: 'upload', dob: '1994-03-12' });
    expect(missing).toMatchObject({ status: 'rejected', rejectionReason: expect.stringContaining('No licence was found') });
  });

  it('vehicle RC: an unknown registration is refused; a real one is verified', async () => {
    const p = await newApplicant('9999900022');
    await expect(p.setVehicle({ class: '2w', ownership: 'own', registrationNo: 'MH 24 AB 0000', rcAssetId: 'rc1' })).rejects.toMatchObject({ code: 'validation', detail: expect.stringContaining('No vehicle was found') });
    await p.setVehicle({ class: '2w', ownership: 'own', registrationNo: 'MH 24 AB 1234', rcAssetId: 'rc1' });
    expect((await p.getMe()).documents.find((d) => d.kind === 'rc')).toMatchObject({ status: 'verified', numberMasked: 'MH 24 AB 1234' });
  });

  it('the returning rider keeps verified documents', async () => {
    const p = new LocalDemoProvider();
    await p.attachPhone(DEMO_RETURNING_PHONE);
    const docs = (await p.getMe()).documents;
    expect(docs.filter((d) => d.status === 'verified').map((d) => d.kind).sort()).toEqual(expect.arrayContaining(['aadhaar', 'dl']));
  });
});
