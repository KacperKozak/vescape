import { BatteryFullIcon } from 'phosphor-react-native'

import { theme } from '@/constants/theme'
import { BoardBatteryForm } from '@/modules/board/components/BoardBatteryForm'
import {
  WizardNavActions,
  WizardStepLayout,
} from '@/modules/board/components/add-board-wizard/WizardStepLayout'
import type { UseAddBoardWizard } from '@/modules/board/hooks/useAddBoardWizard'

export function BatteryStep({ wizard }: { wizard: UseAddBoardWizard }) {
  return (
    <WizardStepLayout
      title="Battery config"
      icon={BatteryFullIcon}
      color={theme.palette.green.color}
      footer={
        <WizardNavActions
          canContinue={wizard.batteryWarning == null}
          onBack={wizard.back}
          onNext={wizard.next}
          testIDPrefix="add-board-battery"
        />
      }
    >
      <BoardBatteryForm
        batteryMode={wizard.batteryMode}
        cellPresetId={wizard.cellPresetId}
        seriesCount={wizard.seriesCount}
        parallelCount={wizard.parallelCount}
        manualMinVoltage={wizard.manualMinVoltage}
        manualMaxVoltage={wizard.manualMaxVoltage}
        onChangeBatteryMode={wizard.setBatteryMode}
        onChangeCellPresetId={wizard.setCellPresetId}
        onChangeSeriesCount={wizard.setSeriesCount}
        onChangeParallelCount={wizard.setParallelCount}
        onChangeManualMinVoltage={wizard.setManualMinVoltage}
        onChangeManualMaxVoltage={wizard.setManualMaxVoltage}
        testIDPrefix="add-board-battery"
      />
    </WizardStepLayout>
  )
}
