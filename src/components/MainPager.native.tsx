import { forwardRef, useImperativeHandle, useRef, type ReactNode } from 'react'
import { StyleSheet } from 'react-native'
import PagerView from 'react-native-pager-view'

export interface MainPagerHandle {
  setPage: (page: number) => void
}

interface MainPagerProps {
  page: number
  onPageChange: (page: number) => void
  children: ReactNode
}

export const MainPager = forwardRef<MainPagerHandle, MainPagerProps>(function MainPager(
  { page, onPageChange, children },
  ref,
) {
  const pagerRef = useRef<PagerView>(null)

  useImperativeHandle(ref, () => ({
    setPage: (nextPage) => {
      pagerRef.current?.setPage(nextPage)
    },
  }))

  return (
    <PagerView
      ref={pagerRef}
      style={styles.pager}
      initialPage={page}
      offscreenPageLimit={2}
      onPageSelected={(event) => onPageChange(event.nativeEvent.position)}
    >
      {children}
    </PagerView>
  )
})

const styles = StyleSheet.create({
  pager: {
    flex: 1,
  },
})
