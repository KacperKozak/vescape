import { CameraIcon, PlusIcon } from 'phosphor-react-native'
import { StyleSheet, View } from 'react-native'

import { Button } from '@/components/base/Button'

export function MapPointMediaActions({
  loading,
  onAdd,
  onCapture,
}: {
  loading: boolean
  onAdd: () => void
  onCapture: () => void
}) {
  return (
    <View style={styles.row}>
      <Button
        label="Add Photos & Videos"
        icon={PlusIcon}
        variant="secondary"
        loading={loading}
        onPress={onAdd}
        style={styles.button}
      />
      <Button
        label="Take Photo or Video"
        icon={CameraIcon}
        variant="secondary"
        loading={loading}
        onPress={onCapture}
        style={styles.button}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    minWidth: 0,
  },
})
