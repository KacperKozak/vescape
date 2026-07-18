package expo.modules.vescapecore.runtime

fun interface Cancellable {
    fun cancel()
}

interface Scheduler {
    fun post(block: () -> Unit): Cancellable
    fun postDelayed(delayMs: Long, block: () -> Unit): Cancellable
}
