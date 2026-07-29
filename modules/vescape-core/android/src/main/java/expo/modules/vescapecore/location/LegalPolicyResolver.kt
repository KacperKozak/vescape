package expo.modules.vescapecore.location

import android.content.Context
import android.location.Geocoder
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Native OS reverse geocoder constrained by the bundled Legal Policy catalog.
 *
 * @parity /modules/vescape-core/ios/location/LegalPolicyResolver.swift
 */
internal class LegalPolicyResolver(private val context: Context) {
    private val catalog = LegalPolicyCatalog(context)

    @Suppress("DEPRECATION")
    suspend fun resolve(latitude: Double, longitude: Double): String? = withContext(Dispatchers.IO) {
        val address = runCatching {
            Geocoder(context, Locale.getDefault()).getFromLocation(latitude, longitude, 1)?.firstOrNull()
        }.getOrNull()
        normalizeCountryCode(address?.countryCode, catalog.countryCodes)
    }
}

internal fun normalizeCountryCode(raw: String?, supported: Set<String>): String? {
    val code = raw?.trim()?.uppercase(Locale.ROOT) ?: return null
    return code.takeIf(supported::contains)
}
