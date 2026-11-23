import type React from 'react';
import type { PersonalStepKey } from 'core';
import type { StepContext } from './stepContext';
import { StepName, StepDob } from './steps';
import { StepPhone } from './StepPhone';
import { StepAvatar } from './StepAvatar';
import { StepIntents } from './StepIntents';
import { StepAccounts } from './StepAccounts';
import { StepCapture } from './StepCapture';
import { StepGmail } from './StepGmail';
import { StepAssets } from './StepAssets';
import { StepNetWorth } from './StepNetWorth';
import { StepBills } from './StepBills';
import { StepGrow } from './StepGrow';
import { StepReminders } from './StepReminders';
import { StepKyc } from './StepKyc';
import { StepWallet } from './StepWallet';

/** Which component draws each Personal onboarding step. A step marked `built` in core must have an entry here. */
export const STEP_COMPONENTS: Partial<Record<PersonalStepKey, React.FC<{ ctx: StepContext }>>> = {
    name: StepName,
    dob: StepDob,
    phone: StepPhone,
    avatar: StepAvatar,
    intents: StepIntents,
    accounts: StepAccounts,
    capture: StepCapture,
    gmail: StepGmail,
    assets: StepAssets,
    net_worth: StepNetWorth,
    bills: StepBills,
    grow: StepGrow,
    reminders: StepReminders,
    kyc: StepKyc,
    wallet: StepWallet,
};
