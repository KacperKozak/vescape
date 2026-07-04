# Tune i Tune Preview — dokładne wyjaśnienie

Ten dokument wyjaśnia, co przedstawia Tune Preview, jak czytać linie **Board** i **Target**, jak
działają podstawowe suwaki tune oraz czego ten podgląd celowo nie symuluje.

Najważniejsze zastrzeżenie: Tune Preview jest deterministycznym modelem porównawczym. Pomaga
zrozumieć kierunek i względną siłę zmian ustawień. Nie jest symulatorem fizycznym konkretnej
deski i nie przewiduje bezpiecznej prędkości, przyspieszenia, drogi hamowania, mocy, przyczepności
ani nosedive'u.

## 1. Najprostszy model mentalny

Wyobraź sobie, że kontroler cały czas wykonuje dwie osobne czynności:

1. Oblicza, pod jakim kątem **chce** utrzymywać deck. To jest **Target**.
2. Próbuje doprowadzić rzeczywisty deck do tego kąta. To jest **Board**.

W podglądzie:

- przerywana linia **Target** oznacza aktualny docelowy kąt;
- niebieska linia **Board** oznacza symulowany aktualny kąt decku;
- odległość kątowa między nimi to chwilowy błąd śledzenia.

Przykład:

```text
Target = +4°
Board  = +2°
Błąd   = Board - Target = -2°
```

Kontroler „widzi”, że Board jest 2° poniżej celu, i model wylicza reakcję, która ma zmniejszyć tę
różnicę.

Target nie jest drugą deską, przewidywaną trasą ani granicą bezpieczeństwa. Jest odpowiedzią na
pytanie: **„Jaki kąt wynika teraz z ustawień tune i bieżącego scenariusza?”**

Board nie pokazuje kąta prawdziwej, podłączonej deski. Jest odpowiedzią modelu na pytanie:
**„Jak idealizowany deck wracałby do Target po ręcznym zaburzeniu kąta przy tych wartościach
PID?”**

## 2. Dlaczego Board nie leży stale na Target

Gdyby Board zawsze idealnie pokrywał się z Target, podgląd nie pokazywałby charakteru tune.
Różnica powstaje dlatego, że:

- Target może się przesuwać;
- użytkownik może chwilowo przytrzymać deck pod zadanym kątem;
- Board ma bezwładność kątową w modelu;
- człon proporcjonalny potrzebuje błędu, aby wytworzyć korektę;
- tłumienie przeciwdziała szybkiej zmianie kąta;
- człon całkujący usuwa utrzymujący się błąd stopniowo, a nie natychmiast.

To podobne do prowadzenia samochodu do środka pasa. Linia środka pasa jest celem, ale samochód nie
teleportuje się na nią. Kierowca wykrywa odchylenie, skręca, tłumi ruch i poprawia pozostały błąd.

## 3. Co dokładnie tworzy Target

Target jest sumą kilku niezależnych korekt:

```text
Target =
  Torque Tilt
  + Brake Tilt
  + ATR
  + Constant Tiltback
  + Variable Tiltback
```

Na końcu wynik jest ograniczany w podglądzie do zakresu `-35°..+35°`.

### 3.1. Torque Tilt

Torque Tilt zmienia Target w odpowiedzi na syntetyczny prąd kontrolera. Prąd nie pochodzi już
bezpośrednio z suwaka. Model wylicza go z błędu Board–Target, prędkości kątowej, błędu całkującego
oraz parametrów PID tune:

```text
prąd korekcyjny ≈
  - sztywność × (Board - Target)
  - tłumienie × prędkość kątowa
  - korekta całkująca
```

Wynik jest ograniczony do `-60..60 A`. Gest zmienia wyłącznie kąt Board. To tune decyduje, jaki
prąd korekcyjny wynika z tego zaburzenia.

Torque Tilt zaczyna działać dopiero po przekroczeniu `torquetilt_start_current`. Nadwyżka prądu
jest mnożona przez odpowiednią siłę i ograniczana przez `torquetilt_angle_limit`.

W uproszczeniu:

```text
nadwyżka = max(abs(prąd) - próg, 0)
kąt = min(nadwyżka × siła, limit kąta)
```

Dla dodatniego prądu używane jest `torquetilt_strength`, a dla ujemnego prądu regen
`torquetilt_strength_regen`.

Przykład:

```text
syntetyczny prąd       = +60 A
próg                   = 15 A
siła                   = 0.10 deg/A
limit                  = 8°

nadwyżka               = 60 - 15 = 45 A
nieograniczony kąt     = 45 × 0.10 = 4.5°
Torque Tilt            = +4.5°
```

### 3.2. Brake Tilt

Brake Tilt działa przy obciążeniu w stronę Regen, jeśli:

- `braketilt_strength` jest większe od zera;
- syntetyczna prędkość przekracza `2000 ERPM`;
- wyliczony prąd kontrolera jest ujemny, czyli scenariusz wymaga regen/hamowania.

Brake Tilt ma własne tempo narastania i wygaszania. `braketilt_lingering` wydłuża jego pozostawanie
po zakończeniu hamowania. Dlatego Target może jeszcze przez chwilę pozostać przesunięty, mimo że
prąd korekcyjny już osłabł.

### 3.3. ATR

ATR nie reaguje bezpośrednio tylko na sam prąd. Próbuje porównać:

- syntetycznie oczekiwane przyspieszenie wynikające z prądu;
- syntetyczne zakłócenie wynikające z nachylenia terenu.

Różnica jest filtrowana przez `atr_filter`, następnie mnożona przez `atr_strength_up` albo
`atr_strength_down`, przepuszczana przez odpowiedni próg i ograniczana przez `atr_angle_limit`.

W uproszczeniu:

```text
oczekiwane przyspieszenie ≈ syntetyczny prąd / współczynnik ATR
zakłócenie od stoku = 9,80665 × nachylenie / √(1 + nachylenie²)
różnica ATR = oczekiwane przyspieszenie + zakłócenie od stoku
surowy ATR = siła ATR × filtrowana różnica ATR
```

Nachylenie `0,1` oznacza podjazd 10% i daje około `0,98 m/s²` składowej grawitacji. Na płaskim
terenie zerowy prąd daje zerową różnicę ATR — model nie dodaje żadnego ukrytego offsetu.

ATR ma pamięć i ograniczoną prędkość zmiany. Nie powinien przeskakiwać natychmiast z pełnego
podnoszenia nosa do pełnego opuszczania nosa.

Przy wyższych ERPM model stosuje także `atr_speed_boost`, `atr_response_boost` i
`atr_transition_boost` zgodnie z warunkami silnika podglądu.

### 3.4. Constant Tiltback

Constant Tiltback jest stałym przesunięciem Target po przekroczeniu progu ERPM:

```text
jeżeli ERPM >= tiltback_constant_erpm:
  Constant Tiltback = tiltback_constant
w przeciwnym razie:
  Constant Tiltback = 0
```

To celowa zmiana kąta docelowego. Nie oznacza, że deck sam z siebie przyspiesza. Właśnie dlatego
podgląd nigdy nie przelicza absolutnego kąta Board na przyspieszenie.

### 3.5. Variable Tiltback

Variable Tiltback rośnie wraz z ERPM ponad ustawiony próg:

```text
postęp = max(ERPM - tiltback_variable_erpm, 0) / 1000
kąt = tiltback_variable × postęp
```

Wartość jest ograniczona przez `tiltback_variable_max`.

Przykład:

```text
ERPM                    = 5000
próg                    = 1000 ERPM
tiltback_variable       = 0.3° / 1000 ERPM
postęp                  = (5000 - 1000) / 1000 = 4
wynik                   = 0.3 × 4 = 1.2°
```

## 4. Jak Board próbuje dogonić Target

Model Board nie uruchamia prawdziwego firmware ani fizyki silnika. Używa uproszczonej odpowiedzi
kątowej, zbudowanej z czterech głównych elementów:

```text
błąd = Board - Target

przyspieszenie kątowe ≈
  (- sztywność × błąd
   - tłumienie × prędkość kątowa
   - korekta całkująca)
  / miękkość filtra
```

Znaczenie składników:

- **sztywność** próbuje zmniejszyć bieżącą różnicę Board–Target;
- **tłumienie** hamuje szybki ruch i ogranicza oscylacje;
- **korekta całkująca** zbiera błąd w czasie i usuwa utrzymujące się odchylenie;
- **miękkość filtra** zmienia charakter reakcji.

Model ogranicza:

- kąt Board do `-35°..+35°`;
- prędkość kątową do `-120..+120°/s`;
- pojedynczy przetwarzany odstęp czasu do `0.25 s`;
- krok obliczeń do `1/120 s`.

Stały mały krok sprawia, że ten sam scenariusz daje powtarzalny wynik niezależnie od typowych
różnic w odświeżaniu ekranu.

## 5. Aggressiveness — co naprawdę zmienia

Aggressiveness nie jest jednym polem. Jeden suwak zapisuje pięć wartości:

| Pole             | Przy `-5` | Przy `+10` | Znaczenie w podglądzie                              |
| ---------------- | --------: | ---------: | --------------------------------------------------- |
| `kp`             |      `15` |       `30` | siła korekty proporcjonalnej                        |
| `kp2`            |     `0.4` |      `1.1` | tłumienie prędkości kątowej                         |
| `ki`             |   `0.015` |    `0.030` | korekta utrzymującego się błędu                     |
| `mahony_kp`      |     `2.2` |      `1.5` | charakter/miękkość odpowiedzi pitch                 |
| `mahony_kp_roll` |     `2.2` |      `1.5` | charakter odpowiedzi roll; niewidoczny w tym widoku |

Dlatego „bardziej aggressive” oznacza jednocześnie:

- mocniejszą reakcję na różnicę Board–Target;
- większe tłumienie szybkiego ruchu;
- mocniejszą korektę błędu utrzymującego się w czasie;
- bardziej bezpośredni charakter filtra w modelu.

To nie jest po prostu mnożnik szybkości animacji.

### Dlaczego czasem na aggressive linie wyglądają na bardziej oddalone

W ustalonym, identycznym scenariuszu mocniejszy tune powinien zasadniczo lepiej ograniczać trwały
błąd Board–Target. Jednak podczas animacji można chwilowo zobaczyć odwrotny obraz. Powody:

1. **Target nadal się porusza.** Dynamiczna prędkość, ATR, Torque Tilt i Tiltback mogą zmieniać cel
   w tym samym czasie, kiedy Board próbuje go dogonić.
2. **Wzrasta też tłumienie.** Wyższe `kp2` mocniej hamuje szybki ruch. To może chwilowo zwiększyć
   odstęp, ale ograniczyć późniejsze przestrzelenie i kołysanie.
3. **Patrzysz na pojedynczą klatkę przejścia.** Odstęp podczas ruchu nie jest tym samym co błąd po
   ustaleniu odpowiedzi.
4. **Zmiana tune nie resetuje całej animacji.** Board, integralError, ATR i przebyta droga zachowują
   dotychczasowy stan. Porównanie wykonane po zmianie suwaka w trakcie ruchu nie zaczyna się z tego
   samego punktu.
5. **To model porównawczy.** Współczynniki odpowiedzi są dobrane do czytelnej prezentacji zakresów
   Refloat, a nie wyprowadzone z masy ridera, momentu silnika i geometrii konkretnej deski.

Jeżeli większy odstęp przy aggressive utrzymuje się stale po uspokojeniu scenariusza, nie należy
interpretować go jako „aggressive z definicji gorzej trzyma Target”. To może wskazywać, że model
podglądu wymaga dalszej kalibracji lub że scenariusz nigdy nie osiąga stanu ustalonego.

## 6. Pozostałe suwaki Basic

### Nose stiffness

Zakres UI `0..10` jest przeliczany na:

```text
torquetilt_strength = Nose stiffness × 0.03 deg/A
```

| Nose stiffness | `torquetilt_strength` |
| -------------: | --------------------: |
|            `0` |          `0.00 deg/A` |
|            `5` |          `0.15 deg/A` |
|           `10` |          `0.30 deg/A` |

Większa wartość mocniej przesuwa Target przy dodatnim syntetycznym prądzie. Ten suwak zmienia
Target, a nie bezpośrednio szybkość, z jaką Board go dogania.

### Tail stiffness

Zakres UI `0..10` jest przeliczany na:

```text
torquetilt_strength_regen = Tail stiffness × 0.03 deg/A
```

Większa wartość mocniej przesuwa Target przy ujemnym prądzie regen.

### ATR intensity

Zakres UI `0..15` ustawia razem siłę ATR w obu kierunkach:

```text
0  -> atr_strength_up/down = 0.0
7.5 -> atr_strength_up/down = 1.0
15 -> atr_strength_up/down = 2.0
```

Większa wartość zwiększa wpływ różnicy między oczekiwanym obciążeniem a syntetycznym stokiem na
Target.

### Brake tilt

Zakres UI `0..5` zapisuje bezpośrednio `braketilt_strength`. W podglądzie wpływa na Target podczas
hamowania powyżej progu `2000 ERPM`.

### Carve tilt

Zakres UI `0..15` zapisuje bezpośrednio `turntilt_strength`. Obecny Tune Preview jest widokiem
wzdłużnym, więc nie symuluje skrętu ani przechyłu roll. Z tego powodu Carve tilt nie zmienia dwóch
linii widocznych w tym podglądzie.

## 7. Deck disturbance

Deck disturbance jest bezpośrednim, chwilowym zaburzeniem kąta Board w zakresie `-12..12°`:

- przesunięcie w stronę **Nose** opuszcza lewy koniec Board;
- środek oznacza brak ręcznego zaburzenia;
- przesunięcie w stronę **Tail** podnosi lewy koniec Board.

Podczas trzymania gestu model traktuje Board jak przytrzymaną ręką: kąt jest wymuszony, a prędkość
kątowa wynosi zero. Kontroler nadal oblicza błąd, prąd korekcyjny i Target.

Po puszczeniu gestu wymuszenie znika. Suwak wizualnie wraca do środka, ale Board nie przeskakuje do
zera. Zaczyna swobodną odpowiedź wynikającą z tune. Można wtedy obserwować:

- szybkość powrotu;
- tłumienie;
- przestrzelenie Target;
- oscylacje;
- błąd pozostający po uspokojeniu.

## 8. Prędkość stała i dynamiczna

### Constant speed włączone

Suwak ustawia stałą prędkość `0..40 km/h`. Jest to domyślny tryb porównawczy, ponieważ dwa tune są
wtedy oceniane przy dokładnie tej samej prędkości.

Podgląd stosuje referencyjne przeliczenie:

```text
3.5 km/h = 1000 ERPM
ERPM = km/h × (1000 / 3.5)
```

Przykłady:

|   Prędkość | Referencyjne ERPM |
| ---------: | ----------------: |
|   `0 km/h` |               `0` |
| `3.5 km/h` |            `1000` |
|   `7 km/h` |            `2000` |
|  `14 km/h` |            `4000` |
|  `35 km/h` |           `10000` |

Jest to referencja dla 11-calowej opony i 30-polowego Hypercore. Nie jest to kalibracja konkretnej
Board.

### Constant speed wyłączone

Prędkość staje się dynamiczna. Ostatnia skonfigurowana prędkość jest punktem początkowym. Zmienia
ją prąd korekcyjny wyliczony przez tune:

```text
zmiana prędkości = (prąd korekcyjny / 60 A) × 6 km/h/s × czas
```

Przykładowo `+30 A` daje `+3 km/h/s`, a `-60 A` daje `-6 km/h/s`. Kąt nie jest przeliczany
bezpośrednio na prędkość. Najpierw tune musi wyliczyć prąd korekcyjny.

Prędkość jest zawsze ograniczona do `0..40 km/h`. Model nie obsługuje jazdy do tyłu.

Dynamiczna prędkość zasila tę samą ścieżkę co prędkość stała:

- przeliczenie ERPM;
- Torque Tilt i Brake Tilt zależne od ERPM;
- Constant i Variable Tiltback;
- zachowanie ATR zależne od prędkości;
- przesuwanie terenu;
- naliczanie syntetycznie przebytej drogi.

Ważne: domyślne `6 km/h/s` nie jest prognozą prawdziwego przyspieszenia Board. Nie uwzględnia masy,
momentu silnika, napięcia, mocy, przyczepności, oporu powietrza ani nachylenia terenu.

## 9. Wzgórza

Wzgórza są sinusoidą przestrzenną:

- **Height** oznacza fizyczną różnicę wysokości dolina→szczyt;
- **Spacing** oznacza odległość szczyt→szczyt;
- prędkość przesuwa Board po tej fali;
- lokalne nachylenie tworzy syntetyczne zakłócenie dla ATR.

Model celowo nie obraca Board automatycznie zgodnie z wizualnym stokiem. Gdyby to robił, mieszałby
geometrię terenu z zachowaniem kontrolera. Stok wpływa na ATR jako zakłócenie obciążenia, ale nie
ustawia bezpośrednio kąta decku.

Wysokość jest ograniczona do `0..50 m`, a spacing do `2..1000 m`. Koło 11″ i teren używają tej
samej skali pikseli na metr w pionie i poziomie. Duża góra wychodzi więc poza ekran; podgląd pokazuje
lokalny fragment stoku zamiast sztucznie zmniejszać ją obok Board.

## 10. Przykładowe eksperymenty

### Eksperyment A: sam Aggressiveness

1. Włącz Constant speed i ustaw `15 km/h`.
2. Wyłącz Hills.
3. Przytrzymaj Deck disturbance na tym samym kącie, np. `+10°`.
4. Puść gest i obserwuj powrót.
5. Powtórz dla Aggressiveness `-5`, `0` i `+10`.

Obserwuj nie tylko maksymalny odstęp Board–Target, ale też:

- jak szybko Board zaczyna reagować;
- czy przestrzeliwuje Target;
- jak szybko uspokaja ruch;
- jaki odstęp zostaje po dłuższej chwili.

### Eksperyment B: Nose stiffness bez ATR

1. Ustaw ATR intensity na `0`.
2. Ustaw stałe `15 km/h`.
3. Przytrzymaj ten sam dodatni kąt Deck disturbance i puść.
4. Porównaj Nose stiffness `0`, `5`, `10`.

Przy większej wartości przede wszystkim powinien przesuwać się Target, ponieważ rośnie składnik
Torque Tilt.

### Eksperyment C: próg Brake Tilt

1. Wymuś dodatni Nose-up Deck disturbance, aby kontroler wyliczył prąd regen.
2. Porównaj `6.9 km/h` i `7.1 km/h`.

Referencyjnie `7 km/h = 2000 ERPM`. Poniżej progu Brake Tilt jest wyłączony, a powyżej może zacząć
wpływać na Target.

### Eksperyment D: Dynamic speed i Tiltback

1. Najpierw przy Constant speed ustaw niską prędkość początkową.
2. Wyłącz Constant speed.
3. Wymuś Nose-down Deck disturbance i puść, aby tune wyliczył dodatni prąd korekcyjny.
4. Obserwuj duży odczyt prędkości po prawej stronie Tune Preview.

Gdy prędkość przekracza progi ERPM, do Target mogą dołączać Constant Tiltback, Variable Tiltback,
Brake Tilt lub mocniejsze zachowanie ATR. Zmiana Target wynika wtedy z przekroczenia progu, a nie
z prostego przeliczenia kąta Board na prędkość.

### Eksperyment E: ATR i teren

1. Ustaw ATR intensity powyżej zera.
2. Włącz Hills.
3. Ustaw umiarkowane Height i Spacing.
4. Wykonuj takie samo zaburzenie kąta i puszczaj Board.

Target powinien zmieniać się wraz z fazą terenu, ponieważ lokalny stok zmienia syntetyczną różnicę
przyspieszenia ATR.

## 11. Jak uczciwie porównywać dwa tune

Aby porównanie miało sens:

1. Użyj Constant speed.
2. Ustaw identyczną prędkość.
3. Przytrzymaj identyczny kąt Deck disturbance i puść go w tym samym momencie porównania.
4. Użyj identycznego terenu albo wyłącz Hills.
5. Porównuj ten sam fragment odpowiedzi: początek ruchu, przejście i stan po uspokojeniu.
6. Nie wyciągaj wniosków z jednej losowej klatki animacji.
7. Pamiętaj, że edycja tune podczas trwającej animacji nie zeruje całego stanu modelu.

Najlepsze pytania do podglądu to:

- „Który tune szybciej ogranicza ten sam błąd?”
- „Który tune bardziej tłumi przestrzelenie?”
- „Jak mocno ten parametr przesuwa Target?”
- „Przy jakiej prędkości włącza się dany próg?”
- „Czy ATR zmienia kierunek między podjazdem i zjazdem?”

Złe pytania to:

- „Czy prawdziwa Board przyspieszy dokładnie o 6 km/h w sekundę?”
- „Czy ten wykres dowodzi, że nie będzie nosedive'u?”
- „Czy z tego odczytam drogę hamowania?”
- „Czy kąt Board oznacza bezpośrednio moment lub moc silnika?”

## 12. Czego Tune Preview nie modeluje

Podgląd nie uwzględnia:

- masy ridera i Board;
- rzeczywistego momentu oraz limitów prądu silnika;
- napięcia baterii i voltage sag;
- dostępnej mocy;
- przyczepności opony;
- oporu toczenia i powietrza;
- geometrii konkretnej Board;
- dokładnej średnicy opony;
- nierówności, uderzeń i utraty kontaktu z podłożem;
- limitu nosedive'u;
- drogi hamowania;
- temperatury silnika i kontrolera;
- zachowania skrętu oraz roll w widoku wzdłużnym;
- pełnego firmware Refloat działającego na prawdziwym kontrolerze.

To ograniczenie jest zamierzone. Dodanie kilku pozornie fizycznych liczb bez pełnego modelu
stworzyłoby fałszywe poczucie dokładności i bezpieczeństwa.

## 13. Podsumowanie w jednym zdaniu

**Target pokazuje kąt żądany przez funkcje tune, Board pokazuje uproszczoną odpowiedź decku na ten
cel i nacisk ridera, a odstęp między nimi pokazuje chwilowy błąd śledzenia — nie zapas mocy ani
poziom bezpieczeństwa.**
