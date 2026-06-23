insert into public.content_items (
    content_key,
    content_type,
    section_key,
    sort_order,
    is_active,
    title_ru,
    title_en,
    title_kk,
    description_ru,
    description_en,
    description_kk,
    price,
    currency,
    image_url,
    image_path,
    image_alt
)
values
(
    'menu-hotel-breakfasts-porridge',
    'menu',
    'hotel-breakfasts',
    0,
    true,
    'Каша на выбор',
    'Porridge of your choice',
    'Таңдауыңыз бойынша ботқа',
    'Манная, рисовая, 7 злаков, пшённая, тары.',
    'Semolina, rice, seven-grain, millet or tary porridge.',
    'Ұнтақ жарма, күріш, 7 дәнді дақыл, тары ботқасы немесе тары.',
    null,
    '₸',
    '',
    '',
    ''
),
(
    'menu-hotel-breakfasts-eggs',
    'menu',
    'hotel-breakfasts',
    1,
    true,
    'Блюда из яиц на выбор',
    'Egg dishes of your choice',
    'Таңдауыңыз бойынша жұмыртқа тағамдары',
    'Яичница: сосиски, колбаса, сыр, помидоры, огурцы, кетчуп.
Яичница с сыром: яйца, сыр, шпинат, сосиски.
Яичница с колбасой: яйца, колбаса копчёная, микс салата.
Яичница с помидорами: яйца, помидоры, лук, микс салата.
Омлет с овощами и сосисками: яйца взбитые, помидоры, лук, перец болгарский, сосиски.
Отварные яйца с сосисками: яйца, сосиски отварные, сыр сметанковый, микс салата.
Яичница с грибами и колбасой: яйца, лук, грибы, помидоры, шпинат, колбаса копчёная.
Шакшука: яйца, помидоры, лук, перец болгарский, сыр творожный, зелень, багет.',
    'Fried eggs: sausages, cold cuts, cheese, tomatoes, cucumbers and ketchup.
Fried eggs with cheese: eggs, cheese, spinach and sausages.
Fried eggs with smoked sausage: eggs, smoked sausage and mixed salad.
Fried eggs with tomatoes: eggs, tomatoes, onion and mixed salad.
Omelette with vegetables and sausages: beaten eggs, tomatoes, onion, bell pepper and sausages.
Boiled eggs with sausages: eggs, boiled sausages, creamy cheese and mixed salad.
Fried eggs with mushrooms and sausage: eggs, onion, mushrooms, tomatoes, spinach and smoked sausage.
Shakshuka: eggs, tomatoes, onion, bell pepper, cream cheese, herbs and baguette.',
    'Жұмыртқа: шұжықша, шұжық, ірімшік, қызанақ, қияр және кетчуп.
Ірімшік қосылған жұмыртқа: жұмыртқа, ірімшік, шпинат және шұжықша.
Шұжық қосылған жұмыртқа: жұмыртқа, ысталған шұжық және салат миксі.
Қызанақ қосылған жұмыртқа: жұмыртқа, қызанақ, пияз және салат миксі.
Көкөніс пен шұжықша қосылған омлет: шайқалған жұмыртқа, қызанақ, пияз, болгар бұрышы және шұжықша.
Шұжықша қосылған пісірілген жұмыртқа: жұмыртқа, пісірілген шұжықша, кілегейлі ірімшік және салат миксі.
Саңырауқұлақ пен шұжық қосылған жұмыртқа: жұмыртқа, пияз, саңырауқұлақ, қызанақ, шпинат және ысталған шұжық.
Шакшука: жұмыртқа, қызанақ, пияз, болгар бұрышы, сүзбе ірімшік, көк және багет.',
    null,
    '₸',
    '',
    '',
    ''
),
(
    'menu-hotel-breakfasts-extras',
    'menu',
    'hotel-breakfasts',
    2,
    true,
    'Дополнительно',
    'Extras',
    'Қосымша',
    'Айран, йогурт, молоко, чай, кофе, масло сливочное, сметана домашняя, джем, лепёшка.',
    'Ayran, yogurt, milk, tea, coffee, butter, homemade sour cream, jam and flatbread.',
    'Айран, йогурт, сүт, шай, кофе, сары май, үй қаймағы, тосап және шелпек.',
    null,
    '₸',
    '',
    '',
    ''
)
on conflict (content_key) do update set
    content_type = excluded.content_type,
    section_key = excluded.section_key,
    sort_order = excluded.sort_order,
    is_active = excluded.is_active,
    title_ru = excluded.title_ru,
    title_en = excluded.title_en,
    title_kk = excluded.title_kk,
    description_ru = excluded.description_ru,
    description_en = excluded.description_en,
    description_kk = excluded.description_kk,
    price = excluded.price,
    currency = excluded.currency,
    image_url = excluded.image_url,
    image_path = excluded.image_path,
    image_alt = excluded.image_alt;
