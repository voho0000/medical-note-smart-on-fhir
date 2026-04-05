extends Resource
class_name ElementTypes
## 五行屬性相剋參考表
##
## 靈木 → 剋靈土 → 剋靈水 → 剋靈火 → 剋靈金 → 剋靈木
##
## 角色風格對應：
##   靈木：自然、生長、治癒
##   靈火：攻擊、爆發、燃燒
##   靈水：支援、減速、淨化
##   靈金：防禦、反擊、鋒利
##   靈土：護盾、持久、封印
##   無屬：神明級角色專屬

const ELEMENT_COLORS: Dictionary = {
	BattleManager.Element.WOOD: Color(0.2, 0.8, 0.3),   # 綠色
	BattleManager.Element.FIRE: Color(0.9, 0.2, 0.1),   # 紅色
	BattleManager.Element.WATER: Color(0.2, 0.4, 0.9),  # 藍色
	BattleManager.Element.METAL: Color(0.8, 0.8, 0.2),  # 金色
	BattleManager.Element.EARTH: Color(0.6, 0.4, 0.2),  # 棕色
	BattleManager.Element.NONE: Color(0.7, 0.5, 0.9),   # 紫色
}

static func get_color(element: BattleManager.Element) -> Color:
	return ELEMENT_COLORS.get(element, Color.WHITE)
