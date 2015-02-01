.PHONY: test benchmark

all: tracecompare.min.js

tracecompare.js: \
	src/barchart.js \
	src/tracecompare.js \
	src/utils.js \
	Makefile

%.min.js: %.js Makefile
	@rm -f $@
	node_modules/.bin/uglifyjs $< -c unsafe=true -m -o $@

%.js:
	@rm -f $@
	@echo '(function(exports){' > $@
	@echo 'tracecompare.version = "'$(shell node -p 'require("./package.json").version')'";' >> $@
	cat $(filter %.js,$^) >> $@
	@echo '})(typeof exports !== '\'undefined\'' && exports || this);' >> $@
	@chmod a-w $@

clean:
	rm -f tracecompare.js tracecompare.min.js

test: all
	@npm test

benchmark: all
	@node test/benchmark.js