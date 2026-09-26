import { JobStepper, type JobStepperProps } from '@/components/app/JobStepper';

/** Which leg of the job the "At Store — Delivery — Verify" stepper is on. */
export type DeliveryPhase = 'at_store' | 'in_transit' | 'arrived' | 'verify';

export const deliveryStepsFor = (phase: DeliveryPhase): JobStepperProps['steps'] => {
  switch (phase) {
    case 'at_store':
      return [
        { label: 'At Store', done: false, active: true },
        { label: 'Delivery', done: false, active: false },
        { label: 'Verify', done: false, active: false },
      ];
    case 'in_transit':
      return [
        { label: 'At Store', done: true, active: false },
        { label: 'Delivery', done: false, active: true },
        { label: 'Verify', done: false, active: false },
      ];
    case 'arrived':
      return [
        { label: 'At Store', done: true, active: false },
        { label: 'Delivery', done: true, active: false },
        { label: 'Verify', done: false, active: false },
      ];
    case 'verify':
      return [
        { label: 'At Store', done: true, active: false },
        { label: 'Delivery', done: true, active: false },
        { label: 'Verify', done: false, active: true },
      ];
  }
};

/** Three-step job stepper used in every bottom drawer of the delivery flow. */
export const DeliveryStepper = ({ phase }: { phase: DeliveryPhase }) => <JobStepper steps={deliveryStepsFor(phase)} />;
