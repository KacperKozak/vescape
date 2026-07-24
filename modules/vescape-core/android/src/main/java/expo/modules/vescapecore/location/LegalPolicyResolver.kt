package expo.modules.vescapecore.location

import android.content.Context
import android.location.Geocoder
import java.util.Locale
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray

/**
 * Native OS reverse geocoder constrained by the bundled Legal Policy catalog.
 *
 * @parity /modules/vescape-core/ios/location/LegalPolicyResolver.swift
 */
internal class LegalPolicyResolver(private val context: Context) {
    private val supportedCountryCodes: Set<String> by lazy {
        val json = context.assets.open("data/legal-policies.json").bufferedReader().use { it.readText() }
        supportedCountryCodes(json)
    }

    @Suppress("DEPRECATION")
    suspend fun resolve(latitude: Double, longitude: Double): String? = withContext(Dispatchers.IO) {
        val address = runCatching {
            Geocoder(context, Locale.getDefault()).getFromLocation(latitude, longitude, 1)?.firstOrNull()
        }.getOrNull()
        normalizeCountryCode(address?.countryCode, supportedCountryCodes)
    }
}

internal fun supportedCountryCodes(json: String): Set<String> {
    val rows = runCatching { JSONArray(json) }.getOrNull() ?: return emptySet()
    return buildSet {
        for (index in 0 until rows.length()) {
            val code = rows.optJSONObject(index)?.optString("code")?.trim()?.uppercase(Locale.ROOT)
            if (!code.isNullOrEmpty()) add(code)
        }
    }
}

internal fun normalizeCountryCode(raw: String?, supported: Set<String>): String? {
    val code = raw?.trim()?.uppercase(Locale.ROOT) ?: return null
    return code.takeIf(supported::contains)
}
