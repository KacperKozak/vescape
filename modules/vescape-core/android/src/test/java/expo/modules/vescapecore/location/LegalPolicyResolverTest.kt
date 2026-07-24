package expo.modules.vescapecore.location

import java.io.File
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class LegalPolicyResolverTest {
    @Test
    fun canonicalCatalogAcceptsSupportedCountriesAndRejectsUnsupportedCountries() {
        val json = File(requireNotNull(javaClass.classLoader).getResource("data/legal-policies.json").toURI())
            .readText()
        val supported = supportedCountryCodes(json)

        assertEquals("PL", normalizeCountryCode("pl", supported))
        assertNull(normalizeCountryCode("US", supported))
        assertNull(normalizeCountryCode(null, supported))
    }
}
