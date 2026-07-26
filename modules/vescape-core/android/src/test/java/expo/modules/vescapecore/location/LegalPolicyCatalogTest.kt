package expo.modules.vescapecore.location

import org.junit.Assert.assertEquals
import org.junit.Test

class LegalPolicyCatalogTest {
    @Test
    fun derivesWarningFromReferenceSpeedWhenJurisdictionHasNoLegalLimit() {
        val rows = parseLegalPolicies(
            """[{"code":"CY","legalSpeedKmh":null,"warningSpeedKmh":null,"referenceSpeedKmh":20}]""",
        )

        assertEquals(LegalPolicySpeeds(15.0, 20.0), rows["CY"])
    }
}
