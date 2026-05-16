import { StyleSheet } from 'react-native'
import { SlidersHorizontalIcon } from 'phosphor-react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { Placeholder } from '@/components/Placeholder'

export default function TuneScreen() {
  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Placeholder icon={SlidersHorizontalIcon} description="Board tuning will appear here." />
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
})
