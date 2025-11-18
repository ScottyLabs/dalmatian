from dataclasses import dataclass
from typing import Dict, Tuple, List


# -----------------------------------------
# Department enum-like class
# -----------------------------------------
class Department:
    # Add all departments your Rust code supports
    CS = "CS"
    MSC = "MSC"
    MATH = "MATH"
    STAT = "STAT"
    # ... add more as needed

    @classmethod
    def all(cls) -> List["Department"]:
        return [cls.CS, cls.MSC, cls.MATH, cls.STAT]

    def __str__(self):
        return self


# -----------------------------------------
# Season enum-like class
# -----------------------------------------
class Season:
    Fall = "Fall"
    Spring = "Spring"
    Summer = "Summer"

    @classmethod
    def all(cls) -> List["Season"]:
        return [cls.Fall, cls.Spring, cls.Summer]

    def as_str(self):
        return self


# -----------------------------------------
# Year struct to match Rust's Year(i32)
# -----------------------------------------
@dataclass(frozen=True)
class Year:
    value: int

    def __str__(self):
        return str(self.value)

    @classmethod
    def all(cls) -> List["Year"]:
        # Whatever years your Rust code enumerates
        return [cls(y) for y in range(2015, 2025)]
        # Or explicitly:
        # return [cls(2018), cls(2019), cls(2020), cls(2021), cls(2022)]


# -----------------------------------------
# SyllabusMap type alias
# (year, season, number, section) → url
# -----------------------------------------
SyllabusMap = Dict[Tuple[Year, Season, str, str], str]
