package expo.modules.vescapecore.runtime

fun Scheduler.postDelayedForSession(
    session: BoardSession,
    delayMs: Long,
    isCurrent: (BoardSession) -> Boolean,
    block: () -> Unit,
): Cancellable = postDelayed(delayMs) {
    if (session.isActive && isCurrent(session)) block()
}
